import fs from 'fs'
import path from 'path'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import texmath from 'markdown-it-texmath'
import anchor from 'markdown-it-anchor'
import matter from 'gray-matter'
import katex from 'katex'
import DOMPurify from 'isomorphic-dompurify'
import { getTitleToSlugMap } from './navigation'

export interface PageContent {
  title: string
  html: string
  /** 原始 Markdown（含 frontmatter），用于客户端原子编辑器 */
  rawContent: string
  attributes: Record<string, string>
  headings: Heading[]
}

export interface Heading {
  id: string
  text: string
  level: number
}

// markdown-it 实例（单例）
const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str: string, lang: string) {
    let highlighted: string
    const escaped = md.utils.escapeHtml(str)
    if (lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      } catch {
        highlighted = escaped
      }
    } else {
      highlighted = escaped
      lang = ''
    }
    const displayLang = lang || 'text'
    return (
      `<div class="code-block-wrapper">` +
      `<div class="code-block-header">` +
      `<span class="code-lang">${md.utils.escapeHtml(displayLang)}</span>` +
      `<button class="code-copy-btn" data-code-copy-btn title="复制代码">` +
      `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制` +
      `</button>` +
      `</div>` +
      `<pre class="hljs"><code>${highlighted}</code></pre>` +
      `</div>`
    )
  },
})
  .use(texmath, { engine: katex, delimiters: 'dollars' })
  .use(anchor, { level: [2, 3], permalink: false })

// ---------- Obsidian Callout 插件 ----------

/**
 * 支持：
 *   > [!note]- 标题  → <details> 折叠（默认收起）
 *   > [!success]+ 标题 → <details open> 折叠（默认展开）
 *   > [!warning] 标题 → <div> 始终可见
 *   > [!bug] 标题     → <div> 始终可见
 */
;(() => {
  type CalloutMeta = { calloutType: string; folding: string; title: string }

  // === Core Rule（在 inline 解析之前剥离标记行）===
  md.core.ruler.before('inline', 'callout_marker', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_close') break
        if (tokens[j].type === 'inline') {
          const m = tokens[j].content
            .match(/^\[!(\w+)]([-+]?)(?:[ \t]+([^\n]*))?(?:\n|$)/)
          if (m) {
            ;(tokens[i] as any).meta = {
              calloutType: m[1].toLowerCase(),
              folding: m[2],
              title: (m[3] ?? '').trim(),
            } satisfies CalloutMeta
            tokens[j].content = tokens[j].content.slice(m[0].length)
          }
          break
        }
      }
    }
  })

  // === Renderer 覆盖 ===
  const origOpen = md.renderer.rules.blockquote_open
  const origClose = md.renderer.rules.blockquote_close
  const calloutStack: boolean[] = []

  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const meta = (tokens[idx] as any).meta as CalloutMeta | undefined
    if (meta?.calloutType) {
      const type = md.utils.escapeHtml(meta.calloutType)
      const folding = meta.folding
      const title = md.utils.escapeHtml(meta.title)
      const label = title || type.charAt(0).toUpperCase() + type.slice(1)

      if (folding === '-' || folding === '+') {
        calloutStack.push(true)
        const openAttr = folding === '+' ? ' open' : ''
        return `<details class="callout callout-${type}"${openAttr}><summary>${label}</summary>`
      }
      calloutStack.push(false)
      return `<div class="callout callout-${type}"><div class="callout-header">${label}</div>`
    }
    return origOpen ? origOpen(tokens, idx, opts, env, self) : '<blockquote>\n'
  }

  md.renderer.rules.blockquote_close = (tokens, idx, opts, env, self) => {
    if (calloutStack.length > 0) {
      return calloutStack.pop() ? '</details>\n' : '</div>\n'
    }
    return origClose ? origClose(tokens, idx, opts, env, self) : '</blockquote>\n'
  }
})()

const DATA_DIR = path.join(process.cwd(), 'data')

/**
 * 根据 slug 路径加载页面内容
 * slug 支持：
 *   []                → home.md
 *   ['campus']        → campus.md
 *   ['campus','map']  → campus/map.md
 */
export function getPageContent(slug: string[]): PageContent {
  const slugPath = slug.length === 0 ? 'home' : slug.join('/')
  const mdPath = path.join(DATA_DIR, 'contents', slugPath + '.md')

  if (!fs.existsSync(mdPath)) {
    return { title: '未找到', html: '<p>页面不存在</p>', rawContent: '页面不存在', attributes: {}, headings: [] }
  }

  const raw = fs.readFileSync(mdPath, 'utf-8')
  const { data, content } = matter(raw)

  // markdown-it 渲染
  let html = md.render(content)

  // 处理图片路径
  html = fixImagePaths(html, slugPath)

  // 处理 Wiki Link [[标题|显示文字]]
  html = replaceWikiLinks(html, slugPath)

  // 添加图片图注
  html = addImageCaptions(html)

  // 构建时 HTML 净化，剥离脚本、事件处理器等
  html = DOMPurify.sanitize(html)

  // 提取标题用于目录（从渲染后 HTML 提取，保证 ID 与 DOM 一致）
  const headings = extractHeadingsFromHtml(html)

  // 从 frontmatter 提取 attributes（同 Obsidian 风格）
  // 渲染后的 HTML 键值对，支持 LaTeX $...$ / Markdown 链接 [text](url)
  const attributes = renderAttributesFromFrontmatter(data)

  return {
    title: (data.title as string) || slug[slug.length - 1] || '首页',
    html,
    rawContent: raw,
    attributes,
    headings,
  }
}

/**
 * 修正图片路径：从 MD 文件所在目录向上查找 `_assets/`，
 * 以正确应对扁平内容结构中多页面共享同一 `_assets/` 目录的情况。
 *
 * 示例：
 *   campus.md              → slug "campus",   前缀 /data/contents/campus/
 *   campus/map.md          → slug "campus/map",前缀 /data/contents/campus/
 *   campus/dormitory.md    → slug "campus/dormitory", 前缀 /data/contents/campus/
 */
function fixImagePaths(html: string, slugPath: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const contentsDir = path.join(process.cwd(), 'data', 'contents')
  const segments = slugPath.split('/')

  // 从最长到最短依次尝试各目录层级，找到第一个包含 _assets/ 的
  let assetPrefix = `${base}/data/contents/${slugPath}/`
  for (let i = segments.length; i > 0; i--) {
    const candidateDir = path.join(contentsDir, ...segments.slice(0, i))
    if (fs.existsSync(path.join(candidateDir, '_assets'))) {
      const rel = segments.slice(0, i).join('/')
      assetPrefix = `${base}/data/contents/${rel}/`
      break
    }
  }

  return html.replace(
    /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi,
    (match, before, src, after) => {
      if (src.startsWith('http') || src.startsWith('/')) return match
      // 防止路径穿越
      if (src.includes('..')) return match
      return `<img ${before}src="${assetPrefix}${src}"${after}>`
    }
  )
}

/**
 * 从渲染后 HTML 提取标题（h2/h3）和它们真实的 id 属性
 * 保证与 markdown-it-anchor 生成的 ID 完全一致
 */
function extractHeadingsFromHtml(html: string): Heading[] {
  const headings: Heading[] = []
  const regex = /<h([23])\s+id="([^"]*)"[^>]*>(.*?)<\/h\1>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]*>/g, '').trim()
    headings.push({
      level: parseInt(match[1]),
      id: match[2],
      text,
    })
  }
  return headings
}

/**
 * 为图片添加图注（<figure><figcaption>）和懒加载
 */
function addImageCaptions(html: string): string {
  return html.replace(
    /<img\s+([^>]*?)alt="([^"]*)"([^>]*)>/gi,
    (match, before, alt, after) => {
      // 剥离 img 标签中的事件处理器属性
      const cleanBefore = stripEventHandlers(before)
      const cleanAfter = stripEventHandlers(after)
      const imgTag = `<img ${cleanBefore}alt="${alt}"${cleanAfter} loading="lazy" class="clickable-image" onclick="window.dispatchEvent(new CustomEvent('open-image-modal', {detail: this.src}))">`
      if (!alt.trim()) return imgTag
      return `<figure class="image-figure">${imgTag}<figcaption>${alt}</figcaption></figure>`
    }
  )
}

/** 剥离 HTML 属性中的 on* 事件处理器 */
function stripEventHandlers(attrs: string): string {
  return attrs.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

/**
 * 从 gray-matter frontmatter 提取 attributes 属性表
 * 使用完整的 markdown-it + KaTeX 管线渲染键和值
 * 支持：$...$（LaTeX）、[text](url)（Markdown 链接）、**粗体**等
 */
function renderAttributesFromFrontmatter(data: Record<string, unknown>): Record<string, string> {
  const rawAttributes = data.attributes
  if (!rawAttributes || typeof rawAttributes !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(rawAttributes)) {
    const renderedKey = DOMPurify.sanitize(md.renderInline(String(key)).trim())
    const strValue = Array.isArray(value) ? value.join('、') : String(value ?? '')
    const renderedValue = DOMPurify.sanitize(md.renderInline(strValue).trim())
    result[renderedKey] = renderedValue
  }
  return result
}

/**
 * 替换 Wiki Link [[标题|显示文字]] 为 <a> 标签
 * 从当前页面的同名目录中查找目标页面，按标题匹配
 */
function replaceWikiLinks(html: string, currentSlug: string): string {
  const titleMap = getTitleToSlugMap()
  const base = process.env.NEXT_PUBLIC_BASE_PATH || ''

  return html.replace(
    /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g,
    (match, title, label) => {
      const slug = titleMap.get(title.trim())
      if (!slug) return match
      // 跳转到当前页面自身 → 用 # 避免刷新
      const href = slug === currentSlug ? '#' : `${base}/${slug}`
      return `<a href="${href}" class="wiki-link">${(label || title).trim()}</a>`
    }
  )
}
