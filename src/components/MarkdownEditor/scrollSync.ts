/* ============================================
   MarkdownEditor — Scroll Sync 工具

   注意：injectLnParser 和 createPreviewMd 已迁移至
   src/lib/render-client.ts，预览渲染统一由 renderClient 完成。
   ============================================ */

/**
 * 在预览区 DOM 中找到最接近指定行号的 data-line 元素
 */
export function findLineInPreview(
  previewEl: HTMLElement,
  lineNumber: number,
): Element | null {
  const candidates = previewEl.querySelectorAll<Element>('[data-line]')
  let best: Element | null = null
  let bestDiff = Infinity

  for (const el of candidates) {
    const ln = parseInt(el.getAttribute('data-line') || '', 10)
    if (isNaN(ln)) continue
    if (ln === lineNumber) return el
    const diff = lineNumber - ln
    if (diff >= 0 && diff < bestDiff) {
      bestDiff = diff
      best = el
    }
  }
  return best
}

/**
 * 获取预览区视口顶部的行号
 */
export function getPreviewLineAtTop(previewEl: HTMLElement): number {
  const candidates = previewEl.querySelectorAll<Element>('[data-line]')
  const containerRect = previewEl.getBoundingClientRect()
  let firstLine = 0
  let firstBottom = Infinity

  for (const el of candidates) {
    const rect = el.getBoundingClientRect()
    const offsetTop = rect.top - containerRect.top
    if (offsetTop >= -rect.height && offsetTop < firstBottom) {
      firstBottom = offsetTop
      firstLine = parseInt(el.getAttribute('data-line') || '0', 10)
    }
  }
  return firstLine
}
