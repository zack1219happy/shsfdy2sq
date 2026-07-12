/**
 * 一次性脚本：将 .md 文件中的内部 Markdown 链接转为 [[Wiki 链接]]
 *
 * 用法：node scripts/convert-to-wikilinks.js
 *
 * 转换规则：
 *   [用户协议](/notice/user-agreement) → [[用户协议]]
 *   [显示文字](/some/path) → [[目标页面标题|显示文字]]
 *   外链 / 锚点 / 绝对路径 → 跳过
 */

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

const CONTENTS_DIR = path.join(process.cwd(), 'data', 'wiki')

// ---------- 构建 slug → title 映射 ----------

/** 递归遍历 + 收集所有 .md 的 frontmatter */
function buildSlugMap() {
  const slugToTitle = {}
  const titleToSlug = {}

  function walk(dir, baseSlug) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, baseSlug ? `${baseSlug}/${entry.name}` : entry.name)
        continue
      }
      if (!entry.name.endsWith('.md')) continue

      const slug = baseSlug
        ? `${baseSlug}/${entry.name.replace(/\.md$/, '')}`
        : entry.name.replace(/\.md$/, '')

      try {
        const { data } = matter(fs.readFileSync(full, 'utf-8'))
        const title = data.title
        if (title && typeof title === 'string') {
          slugToTitle[slug] = title
          titleToSlug[title] = slug
        }
      } catch { /* skip unreadable */ }
    }
  }

  walk(CONTENTS_DIR, '')
  // 首页特殊处理
  slugToTitle['home'] = slugToTitle['home'] || '首页'
  return { slugToTitle, titleToSlug }
}

const { slugToTitle } = buildSlugMap()

// ---------- 转换单个文件 ----------

/** 尝试将链接路径转为 wiki 链接，不能转则返回 null */
function tryConvert(href, text) {
  // 跳过外链、锚点、邮件
  if (/^(https?:|mailto:|#|\.)/i.test(href)) return null

  // 去掉 basePath 前缀（可能带 / 也可能不带 / 开头）
  let slug = href.replace(/^\/?shsfdy2sq\//, '').replace(/^\//, '').replace(/\/$/, '')

  // 在 slug map 中查找
  const title = slugToTitle[slug]
  if (!title) return null

  // 如果显示文字就是标题本身，用 [[title]]，否则用 [[title|text]]
  if (text === title) return `[[${title}]]`
  return `[[${title}|${text}]]`
}

// ---------- 遍历所有 .md 文件 ----------

let totalConverted = 0
let totalFiles = 0

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!entry.name.endsWith('.md')) continue

    const original = fs.readFileSync(full, 'utf-8')
    // 跳过 frontmatter 区域，只处理正文
    const fmMatch = original.match(/^---[\s\S]*?---\n*/)
    const frontmatter = fmMatch ? fmMatch[0] : ''
    const body = fmMatch ? original.slice(frontmatter.length) : original

    // 替换 [text](url) 格式（不包括图片 ![alt](url)）
    const converted = body.replace(
      /\[([^\]]*)\]\(([^)]+)\)/g,
      (match, text, href) => {
        const wikiLink = tryConvert(href.trim(), text.trim())
        if (wikiLink) {
          totalConverted++
          return wikiLink
        }
        return match
      },
    )

    if (converted !== body) {
      totalFiles++
      fs.writeFileSync(full, frontmatter + converted, 'utf-8')
      console.log(`  ${path.relative(CONTENTS_DIR, full)}`)
    }
  }
}

console.log('[convert] 扫描内部链接…')
walk(CONTENTS_DIR)
console.log(`[convert] ✅ 完成：修改 ${totalFiles} 个文件，转换 ${totalConverted} 个链接`)
