/* ============================================
   MarkdownEditor — Preview 面板 Hook
   ============================================ */

'use client'

import { useRef, useMemo, useEffect } from 'react'
import { renderMarkdownWithRegistry, replaceWikiLinks } from '@/lib/markdown'
import { registry, titleSlugMap as defaultTitleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { getPreviewLineAtTop } from './scrollSync'

interface UsePreviewOptions {
  content: string
  /** 预览区滚动回调（发射行号用于 scroll sync） */
  onPreviewScroll?: (lineNumber: number) => void
  /** 标题→slug 映射，传入后启用 [[WikiLink]] 渲染 */
  titleSlugMap?: Record<string, string>
  /** 文件名→图片 URL 映射（如 wiki _assets/ 的 base64），传入后预览渲染 DB 图片 */
  assetsMap?: Record<string, string>
  /** 跳过 DOMPurify 净化（用于已启用 JS 的文章预览） */
  noSanitize?: boolean
  /** 表情身份：编辑者自己的 user id（wiki / 公告传 null 则不解析表情） */
  contextUserId?: string | null
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
  assetsMap,
  noSanitize,
  contextUserId,
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
    const raw = renderMarkdownWithRegistry(content, registry, { highlight: true, texmath: true, injectLn: true, emojiContextUserId: contextUserId ?? null }, !noSanitize)
    // 渲染 [[Wiki 链接]]
    const withLinks = replaceWikiLinks(raw, effectiveMap, basePath)
    // 处理 ```sandbox 块
    const SANDBOX_RE = /<div class="js-sandbox"[^>]*data-payload="([^"]*)"[^>]*><\/div>/g
    const withSandbox = withLinks.replace(SANDBOX_RE, (_match: string, payload: string) => {
      const decoded = decodeURIComponent(payload)
      if (noSanitize) {
        const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(decoded)
        return `<iframe src="${dataUri}" sandbox="allow-scripts" style="width:100%;border:none;display:block;min-height:300px"></iframe>`
      }
      const escaped = decoded
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return (
        `<div class="code-block-wrapper">` +
        `<div class="code-block-header"><span class="code-lang">sandbox</span></div>` +
        `<pre class="hljs"><code class="language-sandbox">${escaped}</code></pre></div>`
      )
    })
    // 替换 _assets/ 图片为传入的映射（DB base64 等）
    let withAssets = withSandbox
    if (assetsMap && Object.keys(assetsMap).length > 0) {
      withAssets = withSandbox.replace(/src="([^"]*_assets\/([^"]+))"/g, (match: string, _src: string, file: string) => {
        const hit = assetsMap[file] ?? assetsMap[decodeURIComponent(file)]
        return hit ? `src="${hit}"` : match
      })
    }
    return withAssets
  }, [content, effectiveMap, basePath, noSanitize, assetsMap, contextUserId])

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
