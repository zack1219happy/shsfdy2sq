#!/usr/bin/env node
/**
 * agens.mjs — Agent CLI
 *
 * 实时发现所有 RPC（通过 get_rpc_catalog），单工具 call_rpc 循环。
 *
 * 用法: node scripts/agens.mjs "你的问题"
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
config({ path: resolve(ROOT, '.env.local') })

// ── 配置 ──

const SUPABASE_URL = 'https://iiiyoafpzfqxpaqheojg.supabase.co'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const AGENT_EMAIL = 'agens@wiki.local'
const AGENT_PASS = '5105058f25fe81f9'
const AGENS_API = 'https://apihub.agnes-ai.com/v1/chat/completions'
const AGENS_KEY = 'sk-RgC9HI2uqwTbpSlfXlOxUEeBafrlpsF4XzSPf4hVHDzNhtYF'

// ── 工具定义（只有 call_rpc） ──

const TOOL_CALL_RPC = {
  type: 'function',
  function: {
    name: 'call_rpc',
    description: '调用数据库 RPC 函数。可用函数名和参数在系统提示中已给出。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'RPC 函数名',
        },
        params: {
          type: 'object',
          description: '参数字典，key=参数名(p_xxx)，value=值。无参传 {}',
          additionalProperties: true,
        },
      },
      required: ['name'],
    },
  },
}

// ── 从 get_rpc_catalog 实时构建系统提示 ──

function buildSystemPrompt(catalog) {
  // 按板块分组，简洁呈现
  const groups = {}
  for (const r of catalog) {
    const area = r.name.startsWith('get_') || r.name.startsWith('search') ? '查询' :
                 r.name.startsWith('create_') || r.name.startsWith('add_') || r.name.startsWith('send_') ? '写入' :
                 r.name.startsWith('update_') || r.name.startsWith('delete_') || r.name.startsWith('vote_') || r.name.startsWith('remove_') ? '修改' :
                 r.name.startsWith('check_') || r.name.startsWith('login') || r.name.startsWith('set_') || r.name.startsWith('change_') ? '账户' : '其他'
    if (!groups[area]) groups[area] = []
    groups[area].push(r)
  }

  let rpcSummary = ''
  for (const [area, funcs] of Object.entries(groups)) {
    rpcSummary += `\n【${area}】\n`
    for (const r of funcs) {
      const desc = r.description || ''
      rpcSummary += `  ${r.name} — ${desc}\n`
    }
  }

  return `你是上海中学二旦班 wiki 的智能助手。你有一个 Agent 账号，可以通过 call_rpc 工具调用数据库函数。

可用函数（共 ${catalog.length} 个）：
${rpcSummary}

使用规则：
- call_rpc 的参数格式：{ "name": "函数名", "params": { "p_xxx": 值 } }
- 先查再答，信息不够就继续查
- uuid 传字符串，布尔传 true/false，无参传 {}
- 回答时引用具体的事实细节`
}

// ── Tool Loop ──

async function callLLM(messages) {
  const body = {
    model: 'agnes-2.0-flash',
    messages,
    tools: [TOOL_CALL_RPC],
    tool_choice: 'auto',
  }

  const start = Date.now()
  const res = await fetch(AGENS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AGENS_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`API ${res.status}: ${errText}`)
  }

  const json = await res.json()
  const msg = json.choices?.[0]?.message || {}
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.error(`  ⏱ ${elapsed}s  tkn:${json.usage?.total_tokens || '?'}`)
  return msg
}

async function runToolLoop(question, supabase, catalog) {
  const systemPrompt = buildSystemPrompt(catalog)

  // 建一个 param 名 → RPC 名的反向索引，用于容错平参调用
  const paramIndex = {}
  for (const r of catalog) {
    if (!r.params) continue
    const names = r.params.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean)
    for (const n of names) paramIndex[n] = paramIndex[n] || []
    // 只记录最后出现的（最相关）
    for (const n of names) {
      if (!paramIndex[n]?.includes(r.name)) paramIndex[n]?.push(r.name)
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ]

  let turn = 0
  console.error(`问题: ${question}\n`)

  while (true) {
    turn++
    console.error(`─ Turn ${turn} ─`)

    const msg = await callLLM(messages)
    const content = msg.content || ''
    const toolCalls = msg.tool_calls || []

    if (content) console.error(`  ${toolCalls.length ? '💭' : '💬'} ${content.substring(0, 300)}`)

    if (!toolCalls.length) return { answer: content, turn }

    for (const tc of toolCalls) {
      const args = JSON.parse(tc.function.arguments || '{}')

      // 容错：模型有时候传 {name, params}，有时候传平参
      let rpcName = args.name
      let rpcParams = args.params ?? {}

      if (!rpcName) {
        // 尝试从参数名反推 RPC
        const argKeys = Object.keys(args).filter(k => k !== 'name' && k !== 'params')
        if (argKeys.length > 0) {
          // 找第一个能匹配到所有 argKeys 的 RPC
          for (const r of catalog) {
            const pNames = (r.params || '').split(',').map(s => s.trim().split(' ')[0]).filter(Boolean)
            if (argKeys.every(k => pNames.includes(k))) {
              rpcName = r.name
              rpcParams = args
              break
            }
          }
        }
        if (!rpcName) rpcName = tc.function.name  // fallback（通常 = 'call_rpc'）
      }

      console.error(`  🔧 ${rpcName}(${JSON.stringify(rpcParams)})`)

      let result
      try {
        const { data, error } = await supabase.rpc(rpcName, rpcParams)
        if (error) {
          // 参数名不对时提示正确签名
          if (error.message?.includes('function') && error.message?.includes('does not exist')) {
            const entry = catalog.find(r => r.name === rpcName)
            result = {
              success: false,
              error: entry
                ? `参数错误。正确参数: ${entry.params}。你传了: ${JSON.stringify(Object.keys(rpcParams))}`
                : error.message
            }
          } else {
            result = { success: false, error: error.message }
          }
        } else {
          result = { success: true, data }
        }
      } catch (e) {
        result = { success: false, error: e.message }
      }

      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: [{
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: JSON.stringify({ name: rpcName, params: rpcParams }) },
        }],
      })
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }
}

// ── 主流程 ──

async function main() {
  const question = process.argv[2]
  if (!question) {
    console.error('用法: node scripts/agens.mjs "你的问题"')
    process.exit(1)
  }

  // 登录
  console.error('登录 Agent...')
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  const { data: session, error: loginErr } = await supabase.auth.signInWithPassword({
    email: AGENT_EMAIL,
    password: AGENT_PASS,
  })
  if (loginErr) throw new Error(`登录失败: ${loginErr.message}`)
  console.error(`✓ 已登录为 ${session.user?.email}`)

  // 实时发现 RPC
  console.error('获取 RPC 列表...')
  const { data: catalog, error: catErr } = await supabase.rpc('get_rpc_catalog')
  if (catErr) throw new Error(`获取 RPC 列表失败: ${catErr.message}`)
  if (!catalog?.length) throw new Error('RPC 列表为空')
  console.error(`✓ 发现 ${catalog.length} 个 RPC\n`)

  const result = await runToolLoop(question, supabase, catalog)

  console.log(result.answer)
  console.error(`\n(turns: ${result.turn})`)
}

main().catch(e => {
  console.error('\n✗ 失败:', e.message)
  process.exit(1)
})
