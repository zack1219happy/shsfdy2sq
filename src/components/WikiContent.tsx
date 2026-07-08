'use client'

import { useMemo, useRef, useEffect } from 'react'
import MarkdownIt from 'markdown-it'
import katex from 'katex'

/** 客户端 markdown-it 实例（轻量，不含 highlight.js） */
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

interface Props {
  /** 原始内容（markdown 或 HTML） */
  content: string
  /** 内容格式，默认自动检测：含 <tag 的视为 HTML，否则按 markdown */
  format?: 'markdown' | 'html'
  className?: string
  /** 标题 → slug 映射，用于客户端渲染 [[Wiki 链接]] */
  titleSlugMap?: Record<string, string>
}

/**
 * 通用内容渲染组件
 *
 * 接受 Markdown 或 HTML 输入，在客户端：
 * 1. 替换 [[Wiki 链接]]
 * 2. Markdown → HTML（markdown-it）
 * 3. HTML 中的 $...$ / $$...$$ → KaTeX
 */
export default function WikiContent({ content, format, className, titleSlugMap }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const basePath = useMemo(() => process.env.NEXT_PUBLIC_BASE_PATH || '', [])
  const html = useMemo(() => {
    // 0. 替换 [[Wiki 链接]]
    let processed = content
    if (titleSlugMap) {
      processed = content.replace(
        /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g,
        (match, title, label) => {
          const slug = titleSlugMap[title.trim()]
          if (!slug) return match
          const href = slug === 'home' ? `${basePath}/` : `${basePath}/${slug}`
          return `[${(label || title).trim()}](${href})`
        },
      )
    }

    // 1. 确定格式并转 HTML
    const rawHtml =
      format === 'markdown' || (format !== 'html' && !looksLikeHtml(processed))
        ? md.render(processed)
        : processed

    // 2. 渲染 LaTeX
    return renderLatexInHtml(rawHtml)
  }, [content, format, titleSlugMap, basePath])

  // 代码块复制按钮：事件委托
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-code-copy-btn]')
      if (!btn) return
      const wrapper = btn.closest('.code-block-wrapper')
      const code = wrapper?.querySelector('code')
      if (!code) return
      try {
        await navigator.clipboard.writeText(code.textContent || '')
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>已复制'
        setTimeout(() => {
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制'
        }, 2000)
      } catch {
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>失败'
        setTimeout(() => {
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制'
        }, 2000)
      }
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [html])

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/** 粗略判断一段文本是不是 HTML（含闭合标签） */
function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>[\s\S]*<\/[a-z]+>/i.test(text)
}

/**
 * 在 HTML 字符串中查找 $...$ / $$...$$ 并用 KaTeX 替换
 */
function renderLatexInHtml(html: string): string {
  // 块级 $$...$$
  let result = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return `$${tex}$`
    }
  })

  // 行内 $...$（不跨行，避免匹配已渲染的 KaTeX HTML）
  result = result.replace(/(?<!<[^>]*)\$([^$\n]+?)\$(?![^<]*>)/g, (_, tex: string) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false })
    } catch {
      return `$${tex}$`
    }
  })

  return result
}
