/* ==============================================================
   简易 Toast 通知
   ============================================================== */

let toastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 在内容区（除掉侧边栏）顶部中间显示一条警告 Toast，3 秒后自动消失。
 * 如果已有 Toast，会先清除再显示新的。
 */
export function showWarningToast(message: string): void {
  const existing = document.getElementById('warning-toast')
  if (existing) existing.remove()
  if (toastTimer !== null) clearTimeout(toastTimer)

  // 内容区中心 = (视口宽度 + 侧边栏宽度) / 2
  const sb = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-actual-width').trim()
  const sidebarPx = parseInt(sb, 10) || 280

  // 外层：负责定位在内容区中心
  const el = document.createElement('div')
  el.id = 'warning-toast'
  Object.assign(el.style, {
    position: 'fixed',
    top: '12px',
    left: `calc(50% + ${sidebarPx / 2}px)`,
    transform: 'translateX(-50%)',
    zIndex: '9999',
    pointerEvents: 'none',
  } as CSSStyleDeclaration)

  // 内层：显示文字，带动画（与外层 transform 不冲突）
  const inner = document.createElement('span')
  inner.textContent = message
  Object.assign(inner.style, {
    display: 'inline-block',
    background: '#dc2626',
    color: '#fff',
    padding: '10px 24px',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: '500',
    boxShadow: '0 4px 16px rgba(220, 38, 38, 0.3)',
    animation: 'fadeInDown 0.2s ease-out',
  } as CSSStyleDeclaration)

  el.appendChild(inner)
  document.body.appendChild(el)

  toastTimer = setTimeout(() => {
    inner.style.opacity = '0'
    inner.style.transition = 'opacity 0.3s'
    setTimeout(() => el.remove(), 300)
    toastTimer = null
  }, 3000)
}

// 注入动画 keyframes（只注入一次）
if (typeof document !== 'undefined' && !document.getElementById('warning-toast-style')) {
  const style = document.createElement('style')
  style.id = 'warning-toast-style'
  style.textContent = `
    @keyframes fadeInDown {
      from { opacity: 0; transform: translateY(-12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
}
