'use client'

import { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { renderClientWithRegistry, replaceWikiLinks } from '@/lib/render-client'
import { registry, titleSlugMap as defaultTitleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { fetchPageAssets } from '@/lib/wiki-api'

interface Props {
  /** 原始内容（markdown 或 HTML） */
  content: string
  /** 内容格式，默认自动检测：含 <tag 的视为 HTML，否则按 markdown */
  format?: 'markdown' | 'html'
  className?: string
  /** 标题 → slug 映射，用于客户端渲染 [[Wiki 链接]]。不传则使用自动生成的映射 */
  titleSlugMap?: Record<string, string>
  /** 页面 slug，用于从 DB 加载 _assets/ 图片 base64 */
  slug?: string
}

/**
 * 通用内容渲染组件
 *
 * 统一经由 render-client 渲染：
 * - Markdown → HTML（markdown-it + highlight.js + KaTeX）
 * - 后处理 [[Wiki 链接]]
 * - _assets/ 图片替换为 DB 中的 base64 data URL
 * - DOMPurify 净化
 * - 代码块复制按钮
 */
export default function WikiContent({ content, format, className, titleSlugMap: propMap, slug }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const basePath = BASE_PATH
  const [assetMap, setAssetMap] = useState<Map<string, string> | null>(null)

  // 从 DB 加载当前页面的图片 base64（向上遍历父 slug）
  useEffect(() => {
    if (!slug) { setAssetMap(null); return }
    let cancelled = false
    const segments = slug.split('/')
    // 从最深到最浅依次尝试，合并所有结果
    ;(async () => {
      const merged = new Map<string, string>()
      for (let i = segments.length; i > 0; i--) {
        const candidate = segments.slice(0, i).join('/')
        try {
          const assets = await fetchPageAssets(candidate)
          for (const [k, v] of assets) { if (!merged.has(k)) merged.set(k, v) }
        } catch { /* 跳过 */ }
      }
      if (!cancelled) setAssetMap(merged.size > 0 ? merged : null)
    })()
    return () => { cancelled = true }
  }, [slug])

  // 优先使用传入的映射，否则使用自动生成的默认映射
  const effectiveMap = propMap ?? defaultTitleSlugMap
  const html = useMemo(() => {
    // 1. 确定格式并转 HTML
    const rawHtml =
      format === 'markdown' || (format !== 'html' && !looksLikeHtml(content))
        ? renderClientWithRegistry(content, registry, { highlight: true, texmath: true, anchor: true })
        : (typeof window !== 'undefined' ? DOMPurify.sanitize(content) : content)

    // 2. 替换 Wiki 链接
    const withLinks = replaceWikiLinks(rawHtml, effectiveMap, basePath)

    // 3. 替换 _assets/ 图片为 DB base64 data URL
    const withAssets = replaceAssetSrcs(withLinks, assetMap)

    return withAssets
  }, [content, format, effectiveMap, basePath, assetMap])

  // ---- callout details open state persistence ----
  // 原生 <details> 的 open 状态不在 React 控制中，dangerouslySetInnerHTML
  // 被重新设置时所有 <details> 会回到初始状态。用 ref 保存当前状态，
  // useLayoutEffect 在同帧 paint 前恢复，避免用户看到闪烁。
  const detailsStateRef = useRef<Record<string, boolean>>({})
  const prevContentRef = useRef(content)

  // 内容变化（编辑后）→ 清空保存的状态
  if (prevContentRef.current !== content) {
    detailsStateRef.current = {}
    prevContentRef.current = content
  }

  // 监听 toggle 事件，持续同步 open 状态到 ref
  // capture phase 确保嵌套 details 也能被捕获
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: Event) => {
      const details = e.target as HTMLDetailsElement
      if (!details.classList.contains('callout')) return
      const all = el.querySelectorAll<HTMLDetailsElement>('details.callout')
      for (let i = 0; i < all.length; i++) {
        if (all[i] === details) {
          detailsStateRef.current[String(i)] = details.open
          return
        }
      }
    }
    el.addEventListener('toggle', handler, true)
    return () => el.removeEventListener('toggle', handler, true)
  }, [html])

  // 渲染后同步恢复状态（在 paint 前执行，无闪烁）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const all = el.querySelectorAll<HTMLDetailsElement>('details.callout')
    for (let i = 0; i < all.length; i++) {
      const saved = detailsStateRef.current[String(i)]
      if (saved !== undefined && all[i].open !== saved) {
        all[i].open = saved
      }
    }
  })

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

/** 将 HTML 中 <img src="_assets/xxx.webp"> 替换为 DB base64 data URL */
function replaceAssetSrcs(html: string, assetMap: Map<string, string> | null): string {
  if (!assetMap || assetMap.size === 0) return html

  return html.replace(
    /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi,
    (match, before, src, after) => {
      // 只处理相对路径的 _assets/ 图片
      if (!src.includes('_assets/') || src.startsWith('http') || src.startsWith('data:')) return match
      const rawFilename = src.split('/').pop()
      if (!rawFilename) return match
      // HTML 中文件名是 URL 编码的，DB 存的是原文字符串
      const filename = decodeURIComponent(rawFilename)
      const dataUrl = assetMap.get(filename)
      if (!dataUrl) return match
      // 替换 src 为 data URL
      return `<img ${before}src="${dataUrl}"${after}>`
    },
  )
}
