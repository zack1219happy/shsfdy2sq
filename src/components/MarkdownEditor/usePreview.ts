/* ============================================
   MarkdownEditor — Preview 面板 Hook
   ============================================ */

'use client'

import { useRef, useMemo, useEffect } from 'react'
import { renderClient } from '@/lib/render-client'
import { getPreviewLineAtTop } from './scrollSync'

interface UsePreviewOptions {
  content: string
  /** 预览区滚动回调（发射行号用于 scroll sync） */
  onPreviewScroll?: (lineNumber: number) => void
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
}: UsePreviewOptions): UsePreviewReturn {
  const previewRef = useRef<HTMLDivElement | null>(null)

  // 通过 render-client 统一渲染（开启 highlight + texmath + injectLn）
  const previewHtml = useMemo(
    () => renderClient(content, { highlight: true, texmath: true, injectLn: true }),
    [content],
  )

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
