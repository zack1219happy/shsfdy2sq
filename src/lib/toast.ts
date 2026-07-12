/* ==============================================================
   简易 Toast 通知
   通过 ToastProvider（React Portal）渲染，此处仅触发事件。
   ============================================================== */

/**
 * 显示一条警告 Toast，3 秒后自动消失。
 * 通过自定义 DOM 事件触发 ToastProvider 渲染。
 */
export function showWarningToast(message: string): void {
  window.dispatchEvent(
    new CustomEvent('show-toast', { detail: { message } }),
  )
}
