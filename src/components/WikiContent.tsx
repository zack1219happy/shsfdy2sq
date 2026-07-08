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
}

/**
 * 通用内容渲染组件
 *
 * 接受 Markdown 或 HTML 输入，在客户端：
 * 1. Markdown → HTML（markdown-it）
 * 2. HTML 中的 $...$ / $$...$$ → KaTeX
 */
export default function WikiContent({ content, format, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => {
    // 1. 确定格式并转 HTML
    const rawHtml =
      format === 'markdown' || (format !== 'html' && !looksLikeHtml(content))
        ? md.render(content)
        : content

    // 2. 渲染 LaTeX
    return renderLatexInHtml(rawHtml)
  }, [content, format])

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
        btn.innerHTML = '✅ 已复制'
        setTimeout(() => {
          btn.innerHTML = '📋 复制'
        }, 2000)
      } catch {
        btn.innerHTML = '❌ 失败'
        setTimeout(() => {
          btn.innerHTML = '📋 复制'
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
