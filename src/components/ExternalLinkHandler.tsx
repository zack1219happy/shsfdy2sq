'use client'

import { useEffect } from 'react'

/* ==============================================================
   ExternalLinkHandler — 全局外部链接处理

   通过事件委托监听所有 <a> 点击：
   - 外部链接（http(s):// 且非本站）→ 新标签页打开
   - 内部链接 → 保持默认行为（当前页导航）
   ============================================================== */

/**
 * 全局外部链接处理组件
 *
 * 挂载在 layout.tsx 中，通过事件委托处理所有外部链接的点击。
 * 覆盖所有内容区域：WikiContent、编辑器预览、评论区等。
 */
export default function ExternalLinkHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
      if (!a) return

      const href = a.getAttribute('href')
      if (!href) return

      // 跳过 JavaScript 链接、锚点、邮件链接等
      if (
        href.startsWith('javascript:') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return
      }

      // 判断是否是外部链接
      try {
        const url = new URL(href, window.location.origin)
        if (url.origin !== window.location.origin) {
          e.preventDefault()
          e.stopPropagation()
          window.open(href, '_blank', 'noopener,noreferrer')
        }
        // 同源链接保持默认行为（当前页导航）
      } catch {
        // 无法解析的 URL（如纯相对路径）→ 保持默认行为
      }
    }

    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  return <>{children}</>
}
