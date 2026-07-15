/**
 * import-wiki-content.mjs
 *
 * 将 data/wiki/*.md 一次性导入到 wiki_pages 表。
 * 需要先执行 migration-v7-wiki-editor.sql 建表。
 *
 * 依赖 .env.local 中的 SUPABASE_DB_PASSWORD。
 *
 * 用法: node scripts/import-wiki-content.mjs
 */

import pg from 'pg'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, join, relative, parse } from 'path'
import { fileURLToPath } from 'url'
import matter from 'gray-matter'

const { Client } = pg

const __dirname = parse(fileURLToPath(import.meta.url)).dir
const WIKI_DIR = resolve(__dirname, '..', 'data', 'wiki')

const client = new Client({
  host: 'db.iiiyoafpzfqxpaqheojg.supabase.co',
  database: 'postgres',
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 5432,
  ssl: { rejectUnauthorized: false },
})

/** 递归扫描所有 .md 文件，返回相对路径列表 */
function scanMdFiles(dir, prefix = '') {
  const entries = []
  let list
  try {
    list = readdirSync(dir, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const e of list) {
    if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === '_assets') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      entries.push(...scanMdFiles(full, prefix ? `${prefix}/${e.name}` : e.name))
    } else if (e.name.endsWith('.md')) {
      const slug = prefix
        ? `${prefix}/${e.name.replace(/\.md$/, '')}`
        : e.name.replace(/\.md$/, '')
      entries.push({ path: full, slug })
    }
  }
  return entries
}

try {
  await client.connect()
  console.log('已连接数据库')

  // 先清空旧数据（重新导入用）
  await client.query('DELETE FROM wiki_revisions')
  await client.query('DELETE FROM wiki_pages')
  console.log('已清空旧数据')

  const files = scanMdFiles(WIKI_DIR)
  console.log(`找到 ${files.length} 个 .md 文件`)

  let imported = 0
  for (const { path: filePath, slug } of files) {
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = matter(raw)
    const title = data.title || slug.split('/').pop() || slug

    const frontmatter = {}
    for (const [key, value] of Object.entries(data)) {
      if (key === 'title') continue
      frontmatter[key] = value
    }

    // 使用 admin 账户（第一个 wiki_users 的 id）作为导入者
    // 如果导入时没有用户，用 NULL
    const { rows: users } = await client.query(
      `SELECT id FROM wiki_users WHERE role IN ('admin', 'super_admin') LIMIT 1`
    )
    const adminId = users.length > 0 ? users[0].id : null

    await client.query(
      `INSERT INTO wiki_pages (slug, title, content, frontmatter, revision, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, 1, $5)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         frontmatter = EXCLUDED.frontmatter,
         revision = wiki_pages.revision + 1`,
      [slug, title, content, JSON.stringify(frontmatter), adminId]
    )

    imported++
    if (imported % 10 === 0) {
      console.log(`  已导入 ${imported}/${files.length}`)
    }
  }

  console.log(`✓ 导入完成：${imported} 个页面`)
  await client.end()
} catch (e) {
  console.error('✗ 导入失败:', e.message)
  await client.end()
  process.exit(1)
}
