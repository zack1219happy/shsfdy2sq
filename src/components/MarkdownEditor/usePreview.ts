/* ============================================
   MarkdownEditor — Preview 面板 Hook
   ============================================ */

'use client'

import { useRef, useMemo, useEffect } from 'react'
import { renderClientWithRegistry, replaceWikiLinks } from '@/lib/render-client'
import { registry, titleSlugMap as defaultTitleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { getPreviewLineAtTop } from './scrollSync'

interface UsePreviewOptions {
  content: string
  /** 预览区滚动回调（发射行号用于 scroll sync） */
  onPreviewScroll?: (lineNumber: number) => void
  /** 标题→slug 映射，传入后启用 [[WikiLink]] 渲染 */
  titleSlugMap?: Record<string, string>
}

interface UsePreviewReturn {
  previewRef: React.RefObject<HTMLDivElement | null>
  previewHtml: string
}

/**
 * usePreview — 管理编辑器的预览面板
 *
 * 使用统一的 render-client 渲染 Markdown：
 * - 代码高亮（highlight.js）
 * - KaTeX 数学公式（markdown-it-texmath）
 * - data-line 注入（scroll sync）
 * - DOMPurify 净化
 */
export function usePreview({
  content,
  onPreviewScroll,
  titleSlugMap: propMap,
}: UsePreviewOptions): UsePreviewReturn {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const basePath = BASE_PATH
  // 合并默认映射 + 传入的覆盖
  const effectiveMap = useMemo(
    () => propMap ? { ...defaultTitleSlugMap, ...propMap } : defaultTitleSlugMap,
    [propMap],
  )

  // 通过 render-client 统一渲染（开启 highlight + texmath + injectLn）
  const previewHtml = useMemo(() => {
    const raw = renderClientWithRegistry(content, registry, { highlight: true, texmath: true, injectLn: true })
    // 渲染 [[Wiki 链接]]
    const withLinks = replaceWikiLinks(raw, effectiveMap, basePath)
    return withLinks
  }, [content, effectiveMap, basePath])

  // 滚动事件监听（scroll sync）
  useEffect(() => {
    const el = previewRef.current
    if (!el || !onPreviewScroll) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const handler = () => {
      if (!onPreviewScroll) return
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        const line = getPreviewLineAtTop(el)
        if (line > 0) onPreviewScroll(line)
      }, 50)
    }

    el.addEventListener('scroll', handler, { passive: true })
    return () => {
      el.removeEventListener('scroll', handler)
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }, [onPreviewScroll])

  return { previewRef, previewHtml }
}
