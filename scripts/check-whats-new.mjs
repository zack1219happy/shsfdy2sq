/**
 * check-whats-new.mjs — 查询自上次运行以来的所有新增内容
 *
 * 用法：
 *   node _scripts/check-whats-new.mjs          # 查询并更新记录时间
 *   node _scripts/check-whats-new.mjs --dry    # 仅查看，不更新记录时间
 *
 * 依赖 .env.local 中的 SUPABASE_DB_PASSWORD。
 * 上次运行时间记录在 _scripts/.last-check.json 中。
 */

import pg from 'pg'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE_FILE = join(__dirname, '.last-check.json')
const DRY = process.argv.includes('--dry')

// ── 加载 .env.local ──
const envPath = join(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) {
      process.env[key] = val
    }
  }
}

const { Client } = pg

const client = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
})

// ── 读取上次运行时间 ──
let lastChecked = null
if (existsSync(STATE_FILE)) {
  const prev = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  lastChecked = prev.lastChecked
  console.log(`📅 上次检查时间: ${lastChecked}`)
} else {
  console.log('📅 首次运行，将查询所有记录')
}

// 本次运行时间（查询前先取，避免漏掉查询执行期间插入的数据）
const now = new Date().toISOString()
const since = lastChecked || '1970-01-01T00:00:00Z'
const sinceDisplay = lastChecked ? `'${lastChecked}'` : '数据库创建以来'

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`🔍 查询 ${sinceDisplay} 至今的所有新增内容`)
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

try {
  await client.connect()

  // ══════════════════════════════════════════
  // 1. Wiki 评论（新增的已审核评论）
  // ══════════════════════════════════════════
  console.log('── 📝 Wiki 评论 ──')
  const { rows: wikiComments } = await client.query(
    `SELECT c.page, c.author, c.content, c.date, c.status,
            COALESCE(c.deleted, false) AS deleted
     FROM comments c
     WHERE c.date > $1
     ORDER BY c.date DESC`,
    [since]
  )
  if (wikiComments.length === 0) {
    console.log('  (无)')
  } else {
    for (const c of wikiComments) {
      const flag = c.deleted ? ' [已删除]' : c.status === 'pending' ? ' [待审核]' : ''
      const preview = (c.content || '').replace(/\n/g, ' ').slice(0, 80)
      console.log(`  📄 ${c.page}`)
      console.log(`     👤 ${c.author}${flag}`)
      console.log(`     💬 ${preview}${(c.content || '').length > 80 ? '…' : ''}`)
      console.log(`     🕐 ${c.date}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 2. 论坛帖子
  // ══════════════════════════════════════════
  console.log('── 📋 论坛帖子 ──')
  const { rows: forumPosts } = await client.query(
    `SELECT fp.id, fp.title, fp.author_username, fp.created_at
     FROM forum_posts fp
     WHERE fp.created_at > $1
     ORDER BY fp.created_at DESC`,
    [since]
  )
  if (forumPosts.length === 0) {
    console.log('  (无)')
  } else {
    for (const p of forumPosts) {
      console.log(`  🏷️ ${p.title}`)
      console.log(`     👤 ${p.author_username}`)
      console.log(`     🔗 /forum/post?id=${p.id}`)
      console.log(`     🕐 ${p.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 2b. 论坛评论
  // ══════════════════════════════════════════
  console.log('── 💬 论坛评论 ──')
  const { rows: forumComments } = await client.query(
    `SELECT fc.content, fc.author_username, fc.created_at,
            fc.deleted, fp.title AS post_title, fp.id AS post_id
     FROM forum_comments fc
     JOIN forum_posts fp ON fc.post_id = fp.id
     WHERE fc.created_at > $1
     ORDER BY fc.created_at DESC`,
    [since]
  )
  if (forumComments.length === 0) {
    console.log('  (无)')
  } else {
    for (const c of forumComments) {
      const flag = c.deleted ? ' [已删除]' : ''
      const preview = (c.content || '').replace(/\n/g, ' ').slice(0, 80)
      console.log(`  🏷️ ${c.post_title}`)
      console.log(`     👤 ${c.author_username}${flag}`)
      console.log(`     💬 ${preview}${c.content && c.content.length > 80 ? '…' : ''}`)
      console.log(`     🔗 /forum/post?id=${c.post_id}`)
      console.log(`     🕐 ${c.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 3. 文章广场文章
  // ══════════════════════════════════════════
  console.log('── 📰 文章广场 ──')
  const { rows: plazaArticles } = await client.query(
    `SELECT pa.slug, pa.title, wu.name AS author_name, wu.username AS author_username, pa.created_at
     FROM plaza_articles pa
     LEFT JOIN wiki_users wu ON pa.author_id = wu.id
     WHERE pa.created_at > $1
     ORDER BY pa.created_at DESC`,
    [since]
  )
  if (plazaArticles.length === 0) {
    console.log('  (无)')
  } else {
    for (const a of plazaArticles) {
      console.log(`  🏷️ ${a.title}`)
      console.log(`     👤 ${a.author_name || a.author_username}`)
      console.log(`     🔗 /plaza/post?slug=${a.slug}`)
      console.log(`     🕐 ${a.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 3b. 文章广场评论
  // ══════════════════════════════════════════
  console.log('── 💬 文章广场评论 ──')
  const { rows: plazaComments } = await client.query(
    `SELECT pc.content, pc.author_username, pc.created_at,
            pc.deleted, pa.title AS article_title, pa.slug AS article_slug
     FROM plaza_comments pc
     JOIN plaza_articles pa ON pc.article_id = pa.id
     WHERE pc.created_at > $1
     ORDER BY pc.created_at DESC`,
    [since]
  )
  if (plazaComments.length === 0) {
    console.log('  (无)')
  } else {
    for (const c of plazaComments) {
      const flag = c.deleted ? ' [已删除]' : ''
      const preview = (c.content || '').replace(/\n/g, ' ').slice(0, 80)
      console.log(`  🏷️ ${c.article_title}`)
      console.log(`     👤 ${c.author_username}${flag}`)
      console.log(`     💬 ${preview}${(c.content || '').length > 80 ? '…' : ''}`)
      console.log(`     🔗 /plaza/post?slug=${c.article_slug}`)
      console.log(`     🕐 ${c.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 4. 许愿（新增）
  // ══════════════════════════════════════════
  console.log('── 🙏 许愿池 ──')
  const { rows: wishes } = await client.query(
    `SELECT w.id, w.title, w.description, w.status, w.created_at,
            wu.name AS author_name, wu.username AS author_username
     FROM wishes w
     LEFT JOIN wiki_users wu ON w.user_id = wu.id
     WHERE w.created_at > $1
     ORDER BY w.created_at DESC`,
    [since]
  )
  if (wishes.length === 0) {
    console.log('  (无)')
  } else {
    for (const w of wishes) {
      const desc = (w.description || '').replace(/\n/g, ' ').slice(0, 60)
      console.log(`  🏷️ ${w.title || '(无标题)'}`)
      console.log(`     👤 ${w.author_name || w.author_username || '未知'}`)
      console.log(`     📝 ${desc}${(w.description || '').length > 60 ? '…' : ''}`)
      console.log(`     📌 ${w.status}`)
      console.log(`     🔗 /wishes/post?id=${w.id}`)
      console.log(`     🕐 ${w.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 4b. 许愿评论
  // ══════════════════════════════════════════
  console.log('── 💬 许愿评论 ──')
  const { rows: wishComments } = await client.query(
    `SELECT wc.content, wc.created_at, wc.deleted,
            wu.name AS author_name, wu.username AS author_username,
            w.title AS wish_title, w.id AS wish_id
     FROM wish_comments wc
     JOIN wishes w ON wc.wish_id = w.id
     LEFT JOIN wiki_users wu ON wc.author_id = wu.id
     WHERE wc.created_at > $1
     ORDER BY wc.created_at DESC`,
    [since]
  )
  if (wishComments.length === 0) {
    console.log('  (无)')
  } else {
    for (const c of wishComments) {
      const flag = c.deleted ? ' [已删除]' : ''
      const preview = (c.content || '').replace(/\n/g, ' ').slice(0, 80)
      console.log(`  🏷️ ${c.wish_title || '(无标题)'}`)
      console.log(`     👤 ${c.author_name || c.author_username || '未知'}${flag}`)
      console.log(`     💬 ${preview}${(c.content || '').length > 80 ? '…' : ''}`)
      console.log(`     🔗 /wishes/post?id=${c.wish_id}`)
      console.log(`     🕐 ${c.created_at}`)
      console.log()
    }
  }

  // ══════════════════════════════════════════
  // 汇总
  // ══════════════════════════════════════════
  const total = wikiComments.length + forumPosts.length + forumComments.length
    + plazaArticles.length + plazaComments.length + wishes.length + wishComments.length
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📊 共 ${total} 条新增内容`)
  console.log(`   Wiki 评论:     ${wikiComments.length}`)
  console.log(`   论坛帖子:      ${forumPosts.length}`)
  console.log(`   论坛评论:      ${forumComments.length}`)
  console.log(`   文章广场:      ${plazaArticles.length}`)
  console.log(`   文章广场评论:  ${plazaComments.length}`)
  console.log(`   许愿:          ${wishes.length}`)
  console.log(`   许愿评论:      ${wishComments.length}`)

  if (DRY) {
    console.log(`\n⚠️ --dry 模式，未更新记录时间`)
  } else {
    writeFileSync(STATE_FILE, JSON.stringify({ lastChecked: now }, null, 2) + '\n')
    console.log(`\n✅ 已更新检查时间为 ${now}`)
  }

  await client.end()
} catch (e) {
  console.error('✗ 执行失败:', e.message)
  try { await client.end() } catch {}
  process.exit(1)
}
