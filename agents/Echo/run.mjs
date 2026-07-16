#!/usr/bin/env node
/**
 * Echo — 自主 Agent 运行脚本
 * 点这个运行，自动每 ~15 分钟上线一次
 *
 * 工具: call_rpc、read_memory、write_memory、delete_memory、wait、random
 * 两阶段: 行动 → 记忆回顾
 * 睡觉: 23:00~8:00
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '../..')
config({ path: resolve(ROOT, '.env.local') })

// ── 配置 ──
const DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = 'https://iiiyoafpzfqxpaqheojg.supabase.co'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const AGENT_EMAIL = 'echo@wiki.local'
const AGENT_PASS = '5105058f25fe81f9'
const API_URL = 'https://api.deepseek.com/chat/completions'
const API_KEY = 'sk-83de6f4aeac043629ee41626ad282aa3'
const MODEL = 'deepseek-v4-flash'
const AGENT_JSON = resolve(__dirname, 'agent.json')
const SLEEP_START = 23
const SLEEP_END = 8
const POLL_MS = 60000                       // 轮询间隔（1 分钟）
const SCHEDULE_HOURS = [8, 11, 15, 19, 22]  // 定时上线时间

// ── 工具定义 ──
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'call_rpc',
      description: '调用数据库 RPC 函数。传全所有参数（包括要传 null 的）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'RPC 函数名' },
          params: { type: 'object', description: '参数字典，key=参数名(p_xxx)，value=值。传全所有参数，可以传 null 的也显式传 null。无参传 {}', additionalProperties: true },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_memory',
      description: '读取记忆。不传 key → 返回所有记忆的 key 和类型概览（折叠）；传 key → 返回该 key 的完整值。支持路径语法。',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '记忆键名，可选' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_memory',
      description: '写入/更新记忆',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '记忆键名，支持路径语法（如 people/user_abc）' },
          value: { description: '值（JSON）' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: '删除记忆条目或子树',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '要删除的键名。支持路径语法' },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wait',
      description: '等待 N 秒（最长 60 秒）。发帖/回复后想等别人回复时用这个工具等',
      parameters: {
        type: 'object',
        properties: {
          seconds: { type: 'number', description: '等待秒数 (1-60)' },
        },
        required: ['seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'random',
      description: '获取随机整数',
      parameters: {
        type: 'object',
        properties: {
          min: { type: 'number', description: '最小值（含）' },
          max: { type: 'number', description: '最大值（含）' },
        },
        required: ['min', 'max'],
      },
    },
  },
]

// ── Supabase 登录 ──
async function login() {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: AGENT_EMAIL,
    password: AGENT_PASS,
  })
  if (error) throw new Error(`登录失败: ${error.message}`)
  console.error(`✓ 已登录为 ${data.user?.email}`)
  return supabase
}

async function getCatalog(supabase) {
  const { data, error } = await supabase.rpc('get_rpc_catalog')
  if (error) throw new Error(`获取 RPC 列表失败: ${error.message}`)
  return data || []
}

// ── 记忆操作（内存中） ──

function foldValue(value, depth = 0) {
  if (depth > 3) return '[max depth]'
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') {
    const s = String(value)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }
  if (Array.isArray(value)) return `[array/${value.length}]`
  const keys = Object.keys(value)
  if (keys.length === 0) return '{}'
  return `{object/${keys.length}} keys: ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '…' : ''}`
}

function readMemory(agent, key) {
  if (!key) {
    const folded = {}
    for (const [k, v] of Object.entries(agent.memory)) {
      folded[k] = foldValue(v)
    }
    return folded
  }
  const parts = key.split('/')
  let current = agent.memory
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return null
    current = current[part]
    if (current === undefined) return null
  }
  return current
}

function writeMemory(agent, key, value) {
  const parts = key.split('/')
  let current = agent.memory
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {}
    }
    current = current[parts[i]]
  }
  current[parts[parts.length - 1]] = value
}

function deleteMemory(agent, key) {
  const parts = key.split('/')
  let current = agent.memory
  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || typeof current !== 'object') return false
    current = current[parts[i]]
    if (current === undefined) return false
  }
  return delete current[parts[parts.length - 1]]
}

// ── 构建系统提示 ──

function buildSystemPrompt(persona, catalog) {
  const groups = {}
  for (const r of catalog) {
    const area = r.name.startsWith('get_') || r.name.startsWith('search') ? '📖 查询' :
                 r.name.startsWith('create_') || r.name.startsWith('add_') || r.name.startsWith('send_') ? '✍️ 写入' :
                 r.name.startsWith('update_') || r.name.startsWith('delete_') || r.name.startsWith('vote_') || r.name.startsWith('remove_') ? '🔧 修改' :
                 r.name.startsWith('check_') ? '🔔 通知/签到' : '📦 其他'
    if (!groups[area]) groups[area] = []
    groups[area].push(r)
  }
  let rpcBlock = ''
  for (const [area, funcs] of Object.entries(groups)) {
    rpcBlock += `\n${area}\n`
    for (const r of funcs) {
      const params = r.params ? '(' + r.params.replace(/\s+\w+/g, '').split(',').map(s => s.trim()).filter(Boolean).join(', ') + ')' : '()'
      rpcBlock += `  ${r.name}${params} ${r.description ? '— ' + r.description : ''}\n`
    }
  }

  return `${persona}

## 可用 RPC 函数（共 ${catalog.length} 个）
${rpcBlock}`
}

// ── LLM 调用 ──

async function callLLM(messages) {
  // 确保所有 assistant 消息都有 reasoning_content（API 要求）
  for (const m of messages) {
    if (m.role === 'assistant' && !('reasoning_content' in m)) {
      m.reasoning_content = ''
    }
  }

  const body = {
    model: MODEL,
    messages,
    tools: TOOLS,
    tool_choice: 'auto',
  }
  const start = Date.now()
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
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

  // 输出完整 reasoning_content
  if (msg.reasoning_content) {
    console.error(`  🧠 ${msg.reasoning_content}`)
  }

  return msg
}

// ── 工具执行 ──

async function executeTool(toolName, args, supabase, agent, catalog) {
  switch (toolName) {
    case 'call_rpc': {
      let rpcName = args.name
      let rpcParams = args.params ?? {}

      // 容错：模型有时候把 params 拍平到顶层
      if (!rpcName) {
        const argKeys = Object.keys(args).filter(k => k !== 'name' && k !== 'params')
        if (argKeys.length > 0 && catalog) {
          for (const r of catalog) {
            const pNames = (r.params || '').split(',').map(s => s.trim().split(' ')[0]).filter(Boolean)
            if (argKeys.every(k => pNames.includes(k))) {
              rpcName = r.name
              rpcParams = args
              break
            }
          }
        }
        if (!rpcName) return { success: false, error: '未指定 RPC 函数名 name' }
      } else if (Object.keys(args).some(k => k !== 'name' && k !== 'params')) {
        // 有 name 但参数在顶层
        rpcParams = {}
        for (const [k, v] of Object.entries(args)) {
          if (k !== 'name') rpcParams[k] = v
        }
      }

      // 参数值 "null" 字符串转为实际 null
      for (const [k, v] of Object.entries(rpcParams)) {
        if (v === 'null') rpcParams[k] = null
      }

      // dry-run：只执行只读 RPC
      if (DRY_RUN && !rpcName.startsWith('get_') && !rpcName.startsWith('search_') && !rpcName.startsWith('check_')) {
        return { success: true, data: `[DRY-RUN] 跳过写入操作: ${rpcName}` }
      }

      const { data, error } = await supabase.rpc(rpcName, rpcParams)
      if (error) {
        // 友好错误提示：参数不对时给出正确签名
        const isParamErr = error.message?.includes('does not exist')
          || error.message?.includes('Could not find the function')
          || error.message?.includes('Could not choose the best candidate function')
        if (isParamErr && catalog) {
          const entries = catalog.filter(r => r.name === rpcName)
          if (entries.length > 0) {
            const sigs = entries.map(e => e.name + '(' + e.params + ')').join('\n  或 ')
            return {
              success: false,
              error: `参数不对。正确签名:\n  ${sigs}\n你传了: ${JSON.stringify(Object.keys(rpcParams))}`,
            }
          }
        }
        return { success: false, error: error.message }
      }
      return { success: true, data }
    }
    case 'read_memory': {
      const value = readMemory(agent, args.key)
      return { success: true, data: value === undefined ? null : value }
    }
    case 'write_memory': {
      writeMemory(agent, args.key, args.value)
      return { success: true, data: 'ok' }
    }
    case 'delete_memory': {
      deleteMemory(agent, args.key)
      return { success: true, data: 'deleted' }
    }
    case 'wait': {
      const secs = Math.min(Math.max(Math.floor(args.seconds || 30), 1), 60)
      console.error(`  ⏳ 等待 ${secs} 秒...`)
      await new Promise(r => setTimeout(r, secs * 1000))
      return { success: true, data: `已等待 ${secs} 秒` }
    }
    case 'random': {
      const min = Math.floor(args.min || 0)
      const max = Math.floor(args.max || 100)
      const value = Math.floor(Math.random() * (max - min + 1)) + min
      return { success: true, data: value }
    }
    default:
      return { success: false, error: `未知工具: ${toolName}` }
  }
}

// ── Tool Loop（无限制，两阶段共用） ──

async function toolLoop(messages, supabase, agent, phase, catalog) {
  const allowedTools = ['call_rpc', 'read_memory', 'write_memory', 'delete_memory', 'wait', 'random']

  console.error(`\n━━━ ${phase} ━━━`)
  let turn = 0
  let lastContent = ''

  while (true) {
    turn++
    if (turn > 1) process.stderr.write(`  ↻ turn ${turn}\n`)

    const msg = await callLLM(messages)
    lastContent = msg.content || ''
    const toolCalls = msg.tool_calls || []

    if (lastContent) {
      const preview = lastContent.length > 200 ? lastContent.slice(0, 200) + '…' : lastContent
      console.error(`  💬 ${preview}`)
    }

    if (!toolCalls.length) break

    for (const tc of toolCalls) {
      let args
      try { args = JSON.parse(tc.function.arguments || '{}') } catch { args = {} }
      const toolName = tc.function.name

      if (!allowedTools.includes(toolName)) {
        console.error(`  ⛔ ${toolName} 在 ${phase} 阶段不可用`)
        messages.push({
          role: 'assistant',
          content: null,
          reasoning_content: '',
          tool_calls: [{ id: tc.id, type: 'function', function: { name: toolName, arguments: tc.function.arguments } }],
        })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ success: false, error: `"${toolName}" 在 ${phase} 阶段不可用` }),
        })
        continue
      }

      const argsPreview = JSON.stringify(args)
      console.error(`  🔧 ${toolName}(${argsPreview.length > 120 ? argsPreview.slice(0, 120) + '…' : argsPreview})`)

      let result
      try {
        result = await executeTool(toolName, args, supabase, agent, catalog)
      } catch (e) {
        result = { success: false, error: e.message }
      }

      const resultPreview = JSON.stringify(result)
      console.error(`  📦 ${resultPreview.length > 500 ? resultPreview.slice(0, 500) + '…' : resultPreview}`)

      messages.push({
        role: 'assistant',
        content: null,
        reasoning_content: '',
        tool_calls: [{
          id: tc.id,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(args) },
        }],
      })
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }
  }

  return lastContent
}

// ── 主循环 ──

async function main() {
  console.error('='.repeat(50))
  console.error('  Echo Agent')
  console.error('  上海中学二旦班 wiki')
  if (DRY_RUN) console.error('  🔇 DRY-RUN 模式（不执行写入操作）')
  console.error('='.repeat(50))

  const supabase = await login()
  const catalog = await getCatalog(supabase)
  console.error(`  ✓ 发现 ${catalog.length} 个 RPC\n`)


  let tickCount = 0

  while (true) {
    await new Promise(r => setTimeout(r, POLL_MS))
    const now = new Date()
    const hour = now.getHours()

    // 睡觉时间 23:00~8:00
    if (hour >= SLEEP_START || hour < SLEEP_END) {
      continue
    }

    // 加载 agent.json（含持久化的 lastTickAt）
    const agent = JSON.parse(readFileSync(AGENT_JSON, 'utf-8'))
    const isScheduleHour = SCHEDULE_HOURS.includes(hour)
    const isNewScheduleHour = isScheduleHour && agent.lastScheduledHour !== hour

    // 查未读私信
    let unreadDmCount = 0
    try {
      const { data } = await supabase.rpc('get_unread_dm_count')
      unreadDmCount = data || 0
    } catch {}
    const hasDm = unreadDmCount > 0

    // 决定是否执行 tick
    const shouldTick = hasDm || isNewScheduleHour
    if (!shouldTick) continue

    tickCount++
    const wakeReason = hasDm ? 'DM' : ('定时 ' + hour + ':00')
    console.error('\n' + wakeReason + '  #' + tickCount + '  ' + now.toLocaleString('zh-CN'))

    // 查未读通知（全量）
    let unreadCount = 0
    try {
      const { data } = await supabase.rpc('get_unread_count')
      unreadCount = data || 0
    } catch {}
    console.error('  @ 通知:' + unreadCount + '  私信:' + unreadDmCount)

    // 构建上下文
    const personaContent = readFileSync(resolve(__dirname, 'persona.md'), 'utf-8')
    const systemPrompt = buildSystemPrompt(personaContent, catalog)
    const lastActions = agent.actions
      .slice(-8)
      .map(a => '  ' + (a.time ? new Date(a.time).toLocaleTimeString('zh-CN') : '?') + ' ' + a.summary)
      .join('\n')

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: hasDm
          ? '现在时间: ' + now.toLocaleString('zh-CN') + '\n你有 ' + unreadDmCount + ' 条未读私信，去处理。如果需要信息，可以去查询。\n\n我不是任何一个社区用户，而是一个社区的无账号管理员。不要输出文字来回复社区用户，用工具给他们发消息或评论。对于我，你只需要用少于 30 字汇报。'
          : '现在时间: ' + now.toLocaleString('zh-CN') + '\n通知: ' + unreadCount + '  私信: ' + unreadDmCount + '\n\n最近活动:\n' + (lastActions || '  （首次上线）') + '\n\n我不是任何一个社区用户，而是一个社区的无账号管理员。不要输出文字来回复社区用户，用工具给他们发消息或评论。对于我，你只需要用少于 30 字汇报。',
      },
    ]

    // 阶段 1: 行动
    const actionSummary = await toolLoop(messages, supabase, agent, '行动', catalog)

    // 阶段 2: 记忆回顾
    messages.push({
      role: 'user',
      content: '【记忆回顾】回顾刚才的行动和看到的信息，用 write_memory/delete_memory 更新记忆。完成后说 OK。',
    })
    await toolLoop(messages, supabase, agent, '记忆回顾', catalog)

    // 记录操作
    const summary = (actionSummary || '(无活动)').slice(0, 300)
    agent.lastTickAt = now.toISOString()
    if (isNewScheduleHour) agent.lastScheduledHour = hour
    agent.actions.push({
      time: now.toISOString(),
      summary,
    })
    if (agent.actions.length > 200) {
      agent.actions = agent.actions.slice(-200)
    }

    // 保存
    writeFileSync(AGENT_JSON, JSON.stringify(agent, null, 2), 'utf-8')
    const memSize = Object.keys(agent.memory || {}).length
    console.error('  + 保存 | 记忆: ' + memSize + ' 条目 | 操作: ' + agent.actions.length + ' 次')
    console.error('  > ' + summary)
  }
}

main().catch(e => {
  console.error('\n✗ 崩溃:', e)
  process.exit(1)
})
