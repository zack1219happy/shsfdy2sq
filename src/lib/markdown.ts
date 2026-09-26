/* ============================================
   markdown — 全站唯一 Markdown 渲染核心

   服务端（SSG 构建期）与客户端共用同一工厂、
   同一份高亮回调、同一组插件挂载、同一个
   标题提取 / WikiLink 替换实现。
   构建期专用（fs/frontmatter）逻辑在 content.ts。
   ============================================ */

import MarkdownIt from 'markdown-it'
// 只注册需要用到的语言，大幅减小 bundle
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import cpp from 'highlight.js/lib/languages/cpp'
import javascript from 'highlight.js/lib/languages/javascript'
import rust from 'highlight.js/lib/languages/rust'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml' // HTML 在 highlight.js 里是 xml
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)

import katex from 'katex'
import texmath from 'markdown-it-texmath'
import anchor from 'markdown-it-anchor'
import DOMPurify from 'isomorphic-dompurify'
import { calloutPlugin, personPlugin, rawHtmlBlockPlugin, sandboxBlockPlugin, luoguCollapsePlugin, emojiPlugin, mentionPlugin } from './md-plugins'
import type { PersonRegistry } from './people'
import { createEmojiResolver } from './emoji/resolve'
import { getLibrarySync } from './emoji/store'
import { isKnownUser } from './mention/store'
import { BASE_PATH } from './constants'

// ============================================================
// 类型
// ============================================================

export interface Heading {
  id: string
  text: string
  level: number
}

export interface MarkdownOptions {
  /** 启用 highlight.js 代码高亮（默认 true） */
  highlight?: boolean
  /** 启用 KaTeX 数学公式（默认 true） */
  texmath?: boolean
  /** 注入 data-line 属性，用于编辑器 scroll sync（默认 false） */
  injectLn?: boolean
  /** 启用 heading ID 锚点（默认 false；SSG 构建恒为 true） */
  anchor?: boolean
  /** Person 注册表，传入则启用 person 引用插件 */
  personRegistry?: PersonRegistry
  /**
   * 表情身份上下文：谁的正文就用谁的表达式。
   * null / 不传（wiki、公告等无主内容）则完全不解析表情语法。
   */
  emojiContextUserId?: string | null
  /** 渲染 @ 提及（默认启用，但仅在用户名白名单已就绪时生效） */
  mention?: boolean
}

/** 高亮回调：统一输出 code-block-wrapper 结构（带复制按钮） */
function highlightCode(utils: MarkdownIt['utils'], str: string, lang: string): string {
  const escaped = utils.escapeHtml(str)
  const wrap = (displayLang: string, inner: string) =>
    `<div class="code-block-wrapper">` +
    `<div class="code-block-header">` +
    `<span class="code-lang">${utils.escapeHtml(displayLang)}</span>` +
    `<button class="code-copy-btn" data-code-copy-btn title="复制代码">` +
    `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制` +
    `</button>` +
    `</div>` +
    `<pre class="hljs"><code>${inner}</code></pre>` +
    `</div>`
  if (lang && hljs.getLanguage(lang)) {
    try {
      return wrap(lang, hljs.highlight(str, { language: lang, ignoreIllegals: true }).value)
    } catch { /* 高亮失败 → 纯文本兜底 */ }
  }
  return wrap('text', escaped)
}

// ============================================================
// 工厂
// ============================================================

const mdCache = new Map<string, MarkdownIt>()

/**
 * 创建 markdown-it 实例：按需启用插件，相同选项复用缓存。
 *
 * 表情 / 提及插件读取的是运行时缓存（表情库、用户名白名单），
 * 所以实例本身与数据快照无关，可以放心复用。
 */
export function createMarkdown(options?: MarkdownOptions): MarkdownIt {
  const opts: MarkdownOptions = {
    highlight: true,
    texmath: true,
    injectLn: false,
    anchor: false,
    mention: true,
    ...options,
  }

  const key = JSON.stringify(opts) + (opts.emojiContextUserId ? '|e' + opts.emojiContextUserId : '')
  const cached = mdCache.get(key)
  if (cached) return cached

  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: opts.highlight ? (str, lang) => highlightCode(md.utils, str, lang) : undefined,
  })

  if (opts.texmath) {
    md.use(texmath, { engine: katex, delimiters: 'dollars' })
  }
  if (opts.anchor) {
    md.use(anchor, { level: [2, 3], permalink: false })
  }
  if (opts.injectLn) {
    // data-line 注入（编辑器 scroll sync）
    md.core.ruler.after('inline', 'inject_data_line', (state) => {
      for (const token of state.tokens) {
        if (token.nesting === 1 && token.map) {
          token.attrSet('data-line', String(token.map[0]))
        }
      }
    })
  }

  // ---------- 共享插件 ----------
  calloutPlugin(md)
  rawHtmlBlockPlugin(md)
  sandboxBlockPlugin(md)
  luoguCollapsePlugin(md)
  if (opts.personRegistry) {
    personPlugin(md, opts.personRegistry)
  }
  if (opts.emojiContextUserId) {
    // 解析时实时读缓存：库加载完成后重渲染即可正确显示
    emojiPlugin(md, (name, pack) =>
      resolveEmojiFor(opts.emojiContextUserId!, name, pack))
  }
  if (opts.mention !== false) {
    mentionPlugin(md, isKnownUser)
  }

  mdCache.set(key, md)
  return md
}

/** 在「内容作者」的表达式里查找（库未加载时返回 null，即按纯文字显示） */
function resolveEmojiFor(userId: string, name: string, pack: string | null) {
  const lib = getLibrarySync(userId)
  const resolver = createEmojiResolver(lib, userId)
  return resolver ? resolver(name, pack) : null
}

// ============================================================
// 渲染
// ============================================================

/**
 * 渲染 Markdown 为 HTML（图片懒加载 + 点击放大标记）。
 * sanitize 默认 true，仅在浏览器环境生效（SSG 阶段由构建管线自行净化）。
 */
export function renderMarkdown(
  content: string,
  options?: MarkdownOptions,
  sanitize = true,
): string {
    const md = createMarkdown(options)
    const raw = addBasePathToInternalLinks(addImageModalSupport(md.render(content)))
    if (sanitize && typeof window !== 'undefined') {
        return DOMPurify.sanitize(raw)
    }
    return raw
}

/** 给 HTML 中的站内根路径链接添加部署前缀，保留已带前缀的路径。 */
export function addBasePathToInternalLinks(html: string, basePath = BASE_PATH): string {
    const prefix = basePath.replace(/\/+$/, '')
    if (!prefix) return html

    return html.replace(/<a\b[^>]*>/gi, (tag) =>
        tag.replace(/(\s)href\s*=\s*(["'])(.*?)\2/i, (attribute, spacing, quote, href: string) => {
            if (!href.startsWith('/') || href.startsWith('//')) return attribute

            const isAlreadyPrefixed =
                href === prefix ||
                href.startsWith(`${prefix}/`) ||
                href.startsWith(`${prefix}?`) ||
                href.startsWith(`${prefix}#`)
            if (isAlreadyPrefixed) return attribute

            return `${spacing}href=${quote}${prefix}${href}${quote}`
        }),
    )
}

/** 渲染 Markdown（同时启用 person 引用插件） */
export function renderMarkdownWithRegistry(
  content: string,
  registry: PersonRegistry,
  options?: MarkdownOptions,
  sanitize = true,
): string {
  return renderMarkdown(content, { ...options, personRegistry: registry }, sanitize)
}

// ============================================================
// 后处理与工具
// ============================================================

/**
 * 为 HTML 中所有 <img> 添加懒加载与 data-image-modal 属性，
 * 本地图片转换为 WebP。data-image-modal 由 ImageModal 组件
 * 通过事件委托捕获，不依赖内联事件，不会被 DOMPurify 剥离。
 */
function addImageModalSupport(html: string): string {
  return html.replace(
    /<img\s+([^>]*?)>/gi,
    (match, attrs) => {
      if (attrs.includes('data-image-modal')) return match
      if (!attrs.includes('src="http')) {
        attrs = attrs.replace(/\.(png|jpg|jpeg)(\?.*)?(")/gi, '.webp$2$3')
      }
      const loadingAttr = attrs.includes('loading=') ? '' : ' loading="lazy"'
      return `<img ${attrs}${loadingAttr} data-image-modal>`
    },
  )
}

/**
 * 从渲染后 HTML 提取 h2/h3 标题及真实 id（与 anchor 插件产物一致），
 * 全站唯一的 TOC 数据源。
 */
export function extractHeadingsFromHtml(html: string): Heading[] {
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
 * 替换 [[Wiki 链接]] 为 <a> 标签（跳过 code/pre 内部文本）。
 * titleSlugMap 支持 Record 或 Map（duck-typing .get）。
 */
export function replaceWikiLinks(
  html: string,
  titleSlugMap?: Record<string, string> | Map<string, string>,
  basePath?: string,
): string {
  if (!titleSlugMap) return html
  const bp = basePath || ''
  const lookup = (title: string) =>
    titleSlugMap instanceof Map ? titleSlugMap.get(title) : titleSlugMap[title]

  // 按 <code>/<pre> 分割，只处理纯文本段
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/gi)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(
        /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g,
        (match, title, label) => {
          const slug = lookup(title.trim())
          if (!slug) return match
          const href = slug === 'home' ? `${bp}/wiki/` : `${bp}/wiki/page?slug=${slug}`
          return `<a href="${href}" class="wiki-link">${(label || title).trim()}</a>`
        },
      )
    })
    .join('')
}

/**
 * 渲染行内标题（支持 [stu:xxx] / [tch:xxx] 等 markdown 语法）
 */
export function renderInlineTitle(title: string): string {
  return DOMPurify.sanitize(createMarkdown({ highlight: false, texmath: false }).renderInline(title)).trim()
}

/**
 * 从 frontmatter 提取 attributes 属性表（Obsidian 风格）。
 * 键与值经完整 markdown-it 管线渲染，支持 $...$（LaTeX）、
 * [text](url)（Markdown 链接）、**粗体** 等。
 */
export function renderAttributesFromFrontmatter(data: Record<string, unknown>): Record<string, string> {
  const rawAttributes = data.attributes
  if (!rawAttributes || typeof rawAttributes !== 'object') return {}
  const md = createMarkdown({})
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
 * 表情语法退化为纯文字：{包:表情} → 表情，{表情} → 表情。
 * 列表摘要 / 通知文案等不能出图的地方用。
 */
export function stripEmojiSyntax(text: string): string {
  if (!text) return text
  return text
    .replace(/\{([^{}\s:]{1,24}):([^{}\s]{1,24})\}/g, '$2')
    .replace(/\{([^{}\s:]{1,24})\}/g, '$1')
}

/**
 * 将 markdown 转为纯文本（浏览器 DOM textContent），用于列表卡片预览。
 */
export function stripMarkdown(mdText: string, maxLen = 120): string {
  if (typeof window === 'undefined') return mdText.slice(0, maxLen)
  const mdInstance = createMarkdown({ highlight: false, texmath: false })
  const html = mdInstance.render(stripEmojiSyntax(mdText))
  const div = document.createElement('div')
  div.innerHTML = html
  const text = (div.textContent || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text
}
