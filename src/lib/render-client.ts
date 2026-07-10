/* ============================================
   render-client — 客户端 Markdown 渲染工厂

   统一 WikiContent 和编辑器预览的渲染逻辑。
   服务器构建仍用 content.ts（含 fs/frontmatter 等）。
   ============================================ */

import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import katex from 'katex'
import texmath from 'markdown-it-texmath'
import anchor from 'markdown-it-anchor'
import DOMPurify from 'dompurify'

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

  // ---------- Callout 插件（> [!note] / > [!warning] / > [!bug] 等） ----------
  // 与服务端 content.ts 实现相同
  calloutPlugin(md)

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
  if (sanitize && typeof window !== 'undefined') {
    return DOMPurify.sanitize(raw)
  }
  return raw
}

// ============================================================
// WikiLink 替换（后处理，独立于 markdown-it）
// ============================================================

/**
 * 替换 [[Wiki 链接]] 为 <a> 标签
 * 需传入标题→slug 映射表
 */
export function replaceWikiLinks(
  html: string,
  titleSlugMap?: Record<string, string>,
  basePath?: string,
): string {
  if (!titleSlugMap) return html
  const bp = basePath || ''

  return html.replace(
    /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g,
    (_match, title, label) => {
      const slug = titleSlugMap[title.trim()]
      if (!slug) return _match
      const href = slug === 'home' ? `${bp}/` : `${bp}/${slug}`
      return `<a href="${href}" class="wiki-link">${(label || title).trim()}</a>`
    },
  )
}

// ============================================================
// Callout 插件（> [!note] / > [!warning] / > [!success] / > [!bug]）
// ============================================================

interface CalloutMeta {
  calloutType: string
  folding: string
  title: string
}

/**
 * markdown-it 插件：将 > [!type] 语法转为 callout div 或 details 折叠框
 * 与服务端 content.ts 实现相同
 */
function calloutPlugin(md: MarkdownIt): void {
  // Core Rule：在 inline 解析之前剥离标记行
  md.core.ruler.before('inline', 'callout_marker', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_close') break
        if (tokens[j].type === 'inline') {
          const m = tokens[j].content.match(
            /^\[!(\w+)]([-+]?)(?:[ \t]+([^\n]*))?(?:\n|$)/,
          )
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

  // Renderer 覆盖
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
    return origClose
      ? origClose(tokens, idx, opts, env, self)
      : '</blockquote>\n'
  }
}