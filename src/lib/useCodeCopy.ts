/* ============================================
   useCodeCopy — 代码块复制按钮事件委托 hook

   监听容器上的 click 事件，通过 [data-code-copy-btn]
   捕获复制按钮点击，将对应 code 块内容写入剪贴板。
   ============================================ */

'use client'

import { useEffect, type RefObject } from 'react'

const COPIED_HTML =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>已复制'

const FAILED_HTML =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>失败'

const ORIGINAL_HTML =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>复制'

export function useCodeCopy(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-code-copy-btn]')
      if (!btn) return
      const wrapper = btn.closest('.code-block-wrapper')
      const code = wrapper?.querySelector('code')
      if (!code) return
      try {
        await navigator.clipboard.writeText(code.textContent || '')
        btn.innerHTML = COPIED_HTML
        setTimeout(() => { btn.innerHTML = ORIGINAL_HTML }, 2000)
      } catch {
        btn.innerHTML = FAILED_HTML
        setTimeout(() => { btn.innerHTML = ORIGINAL_HTML }, 2000)
      }
    }

    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [containerRef])
}
