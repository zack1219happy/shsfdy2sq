/* ============================================
   render-client — 客户端 Markdown 渲染工厂

   统一 WikiContent 和编辑器预览的渲染逻辑。
   服务器构建仍用 content.ts（含 fs/frontmatter 等）。
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
hljs.registerLanguage('html', xml)              // ```html 映射到 xml 高亮器
hljs.registerLanguage('xml', xml)               // 完整支持
import katex from 'katex'
import texmath from 'markdown-it-texmath'
import anchor from 'markdown-it-anchor'
import DOMPurify from 'dompurify'
import { calloutPlugin, personPlugin } from './md-plugins'
import type { PersonRegistry } from './people'

// ============================================================
// 配置选项
// ============================================================

export interface ClientMdOptions {
  /** 启用 highlight.js 代码高亮（默认 true） */
  highlight?: boolean
  /** 启用 KaTeX 数学公式（默认 true） */
  texmath?: boolean
  /** 注入 data-line 属性，用于编辑器 scroll sync（默认 false） */
  injectLn?: boolean
  /** 启用 heading ID 锚点（默认 false） */
  anchor?: boolean
  /** Person 注册表，传入则启用 person 引用插件 */
  personRegistry?: PersonRegistry
}

// ============================================================
// 工厂函数
// ============================================================

let mdSingleton: MarkdownIt | null = null

/**
 * 创建客户端 markdown-it 实例
 *
 * 根据 options 按需启用插件，避免不必要的包体积。
 * 相同 options 复用单例。
 */
export function createClientMd(options?: ClientMdOptions): MarkdownIt {
  const opts: ClientMdOptions = {
    highlight: true,
    texmath: true,
    injectLn: false,
    anchor: false,
    ...options,
  }

  // 最简配置（无 highlight/texmath）— 目前没有这种场景，但保留扩展性
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: opts.highlight
      ? (str: string, lang: string) => {
          const escaped = mdSingleton
            ? mdSingleton.utils.escapeHtml(str)
            : str
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
          if (lang && hljs.getLanguage(lang)) {
            try {
              const highlighted = hljs.highlight(str, {
                language: lang,
                ignoreIllegals: true,
              }).value
              const displayLang = lang
              return (
                `<div class="code-block-wrapper">` +
                `<div class="code-block-header">` +
                `<span class="code-lang">${displayLang}</span>` +
                `<button class="code-copy-btn" data-code-copy-btn title="复制代码">` +
                `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制` +
                `</button>` +
                `</div>` +
                `<pre class="hljs"><code>${highlighted}</code></pre>` +
                `</div>`
              )
            } catch {
              return `<pre class="hljs"><code>${escaped}</code></pre>`
            }
          }
          return `<pre class="hljs"><code>${escaped}</code></pre>`
        }
      : undefined,
  })

  // KaTeX 数学公式
  if (opts.texmath) {
    md.use(texmath, { engine: katex, delimiters: 'dollars' })
  }

  // heading ID 锚点
  if (opts.anchor) {
    md.use(anchor, { level: [2, 3], permalink: false })
  }

  // data-line 注入（编辑器 scroll sync）
  if (opts.injectLn) {
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
  if (opts.personRegistry) {
    personPlugin(md, opts.personRegistry)
  }

  // 缓存单例供 highlight 回调引用
  mdSingleton = md

  return md
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 渲染 Markdown 为 HTML
 *
 * @param content 原始 Markdown 字符串
 * @param options 工厂选项
 * @param sanitize 是否净化 HTML，默认 true
 */
export function renderClient(
  content: string,
  options?: ClientMdOptions,
  sanitize = true,
): string {
  const md = createClientMd(options)
  const raw = md.render(content)
  const withImages = addImageModalSupport(raw)
  if (sanitize && typeof window !== 'undefined') {
    return DOMPurify.sanitize(withImages)
  }
  return withImages
}

/**
 * 渲染 Markdown 为 HTML（同时启用 person 引用插件）
 */
export function renderClientWithRegistry(
  content: string,
  registry: PersonRegistry,
  options?: ClientMdOptions,
  sanitize = true,
): string {
  const md = createClientMd({ ...options, personRegistry: registry })
  const raw = md.render(content)
  const withImages = addImageModalSupport(raw)
  if (sanitize && typeof window !== 'undefined') {
    return DOMPurify.sanitize(withImages)
  }
  return withImages
}

// ============================================================
// 图片后处理：懒加载 + 点击放大标记
// ============================================================

/**
 * 为 HTML 中的所有 <img> 添加懒加载和 data-image-modal 属性。
 *
 * data-image-modal 被 ImageModal 组件的事件委托捕获，
 * 用于点击放大查看。不依赖内联事件处理器，不会被 DOMPurify 剥离。
 */
export function addImageModalSupport(html: string): string {
  return html.replace(
    /<img\s+([^>]*?)>/gi,
    (_match, attrs) => {
      // 防止重复处理
      if (attrs.includes('data-image-modal')) return _match
      // 替换图片格式为 WebP（convert-images-webp.js 已生成 .webp 副本）
      attrs = attrs.replace(/\.(png|jpg|jpeg)(\?.*)?(")/gi, '.webp$2')
      // 跳过已含 loading 的图片
      const loadingAttr = attrs.includes('loading=') ? '' : ' loading="lazy"'
      return `<img ${attrs}${loadingAttr} data-image-modal>`
    },
  )
}

// ============================================================
// WikiLink 替换（后处理，独立于 markdown-it）
// ============================================================

/**
 * 替换 [[Wiki 链接]] 为 <a> 标签
 * 跳过 <code>、<pre> 内的内容（行内代码/代码块）
 * 需传入标题→slug 映射表
 */
export function replaceWikiLinks(
  html: string,
  titleSlugMap?: Record<string, string>,
  basePath?: string,
): string {
  if (!titleSlugMap) return html
  const bp = basePath || ''

  // 将 HTML 按 <code> 和 <pre> 分割，只处理纯文本段
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/gi)
  return parts
    .map((part, i) => {
      // 奇数索引是 code/pre 块，跳过
      if (i % 2 === 1) return part
      return part.replace(
        /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g,
        (_match, title, label) => {
          const slug = titleSlugMap[title.trim()]
          if (!slug) return _match
          const href = slug === 'home' ? `${bp}/wiki/` : `${bp}/wiki/${slug}`
          return `<a href="${href}" class="wiki-link">${(label || title).trim()}</a>`
        },
      )
    })
    .join('')
}

