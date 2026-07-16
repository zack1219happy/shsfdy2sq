/**
 * ask-agens.mjs — Tool loop: LLM 自主调用工具查询数据库，回答用户问题
 *
 * 参考 Echoes 的 tool-loop.ts 模式（LLM → 工具 → LLM → ... → 回答）
 *
 * 用法：node scripts/ask-agens.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

config({ path: resolve(ROOT, '.env.local') })

const { Client } = pg

function readPassword() {
  const envPath = resolve(ROOT, '.env.local')
  const content = readFileSync(envPath, 'utf8')
  const m = content.match(/^SUPABASE_DB_PASSWORD=(.+)$/m)
  if (!m) throw new Error('无法从 .env.local 读取 SUPABASE_DB_PASSWORD')
  return m[1].trim()
}

const db = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: readPassword(),
  port: 5432,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
})

const AGENS_API = 'https://apihub.agnes-ai.com/v1/chat/completions'
const AGENS_KEY = 'sk-RgC9HI2uqwTbpSlfXlOxUEeBafrlpsF4XzSPf4hVHDzNhtYF'

const SYSTEM_PROMPT = `你是上海中学二旦班 wiki 的智能助手。有数据库工具可以查询 wiki 页面、论坛帖子及其评论。用工具查信息，然后回答问题。回答时引用具体事实细节。信息不够就继续查。`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_all_wiki_pages',
      description: '列出所有 wiki 页面（slug 和 title）',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wiki_page',
      description: '获取 wiki 页面完整内容',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string', description: '页面 slug' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_wiki_pages',
      description: '按关键词搜索 wiki 页面标题和内容',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_forum_posts',
      description: '按关键词搜索论坛帖子标题和内容',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_forum_post',
      description: '获取单个论坛帖子的完整内容和所有评论',
      parameters: {
        type: 'object',
        properties: { post_id: { type: 'string', description: '帖子 UUID' } },
        required: ['post_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_forum_comments',
      description: '获取论坛帖子的所有评论',
      parameters: {
        type: 'object',
        properties: { post_id: { type: 'string', description: '帖子 UUID' } },
        required: ['post_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_page_comments',
      description: '获取 wiki 页面上的评论',
      parameters: {
        type: 'object',
        properties: { page: { type: 'string', description: '页面路径' } },
        required: ['page'],
      },
    },
  },
]

// ── 工具实现 ──

async function listAllWikiPages() {
  const { rows } = await db.query('SELECT slug, title FROM wiki_pages ORDER BY slug')
  return rows
}

async function getWikiPage(slug) {
  const { rows } = await db.query(
    'SELECT slug, title, content, revision, updated_at FROM wiki_pages WHERE slug = $1',
    [slug]
  )
  return rows[0] || null
}

async function searchWikiPages(query) {
  const like = `%${query}%`
  const { rows } = await db.query(
    'SELECT slug, title, LEFT(content, 500) AS excerpt FROM wiki_pages WHERE title ILIKE $1 OR content ILIKE $1 LIMIT 5',
    [like]
  )
  return rows
}

async function searchForumPosts(query) {
  const like = `%${query}%`
  const { rows } = await db.query(`
    SELECT fp.id, fp.title, LEFT(fp.content, 500) AS excerpt, fp.created_at, u.username
    FROM forum_posts fp
    LEFT JOIN wiki_users u ON fp.author_id = u.id
    WHERE fp.title ILIKE $1 OR fp.content ILIKE $1
    ORDER BY fp.created_at DESC
    LIMIT 10
  `, [like])
  return rows
}

async function getForumPost(postId) {
  // 帖子内容 + 所有评论一并返回
  const { rows: posts } = await db.query(`
    SELECT fp.id, fp.title, fp.content, fp.created_at, u.username
    FROM forum_posts fp
    LEFT JOIN wiki_users u ON fp.author_id = u.id
    WHERE fp.id = $1
  `, [postId])
  if (!posts[0]) return null
  const { rows: comments } = await db.query(`
    SELECT fc.content, fc.created_at, u.username
    FROM forum_comments fc
    LEFT JOIN wiki_users u ON fc.author_id = u.id
    WHERE fc.post_id = $1
    ORDER BY fc.created_at ASC
  `, [postId])
  return { ...posts[0], comments }
}

async function getForumComments(postId) {
  const { rows } = await db.query(`
    SELECT fc.id, fc.content, fc.created_at, u.username
    FROM forum_comments fc
    LEFT JOIN wiki_users u ON fc.author_id = u.id
    WHERE fc.post_id = $1
    ORDER BY fc.created_at ASC
  `, [postId])
  return rows
}

async function getPageComments(page) {
  const { rows } = await db.query(`
    SELECT id, content, author, date, status
    FROM comments
    WHERE page = $1 AND status = 'approved'
    ORDER BY date ASC
  `, [page])
  return rows
}

const TOOL_IMPL = {
  list_all_wiki_pages: async () => ({ success: true, data: await listAllWikiPages() }),
  get_wiki_page: async (args) => ({ success: true, data: await getWikiPage(args.slug) }),
  search_wiki_pages: async (args) => ({ success: true, data: await searchWikiPages(args.query) }),
  search_forum_posts: async (args) => ({ success: true, data: await searchForumPosts(args.query) }),
  get_forum_post: async (args) => ({ success: true, data: await getForumPost(args.post_id) }),
  get_forum_comments: async (args) => ({ success: true, data: await getForumComments(args.post_id) }),
  get_page_comments: async (args) => ({ success: true, data: await getPageComments(args.page) }),
}

// ── Tool Loop ──

async function callLLM(messages) {
  const body = {
    model: 'agnes-2.0-flash',
    messages,
    tools: TOOLS,
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
    throw new Error(`agens API 错误 (${res.status}): ${errText}`)
  }

  const json = await res.json()
  const msg = json.choices?.[0]?.message || {}
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`  ⏱ ${elapsed}s  tkn:${json.usage?.total_tokens || '?'}`)
  return msg
}

async function runToolLoop(question) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ]

  let turn = 0
  console.log(`问题: ${question}\n`)

  while (true) {
    turn++
    console.log(`─ Turn ${turn} ─`)

    const msg = await callLLM(messages)
    const content = msg.content || ''
    const toolCalls = msg.tool_calls || []

    if (content) console.log(`  ${toolCalls.length ? '💭' : '💬'} ${content.substring(0, 300)}`)

    if (!toolCalls.length) return { answer: content, turn }

    for (const tc of toolCalls) {
      const args = JSON.parse(tc.function.arguments || '{}')
      console.log(`  🔧 ${tc.function.name}(${JSON.stringify(args)})`)

      let result
      try {
        result = await (TOOL_IMPL[tc.function.name]?.(args) ?? Promise.resolve({ success: false, error: '未知工具' }))
      } catch (e) {
        result = { success: false, error: e.message }
      }

      messages.push({
        role: 'assistant',
        content: content || null,
        tool_calls: [{
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: JSON.stringify(args) },
        }],
      })
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }
}

async function main() {
  await db.connect()
  console.log('✓ 已连接数据库\n')

  const result = await runToolLoop('《我和我的文化人朋友》的两个创作者有什么故事？他们是谁？有什么背景？')
  console.log(`\n${'='.repeat(60)}`)
  console.log(result.answer)
  console.log(`\n(turns: ${result.turn})`)

  await db.end()
}

main().catch(e => {
  console.error('\n✗ 脚本失败:', e)
  process.exit(1)
})
