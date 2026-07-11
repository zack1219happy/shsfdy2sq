/**
 * 论坛共享工具函数
 */

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return diffMin + ' 分钟前'

    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return diffHour + ' 小时前'

    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 7) return diffDay + ' 天前'

    return d.toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * CSS Module 颜色类名映射表
 * 每个路由文件需传入对应的 styles 对象
 */
export interface ColorStyles {
  colorTqy: string
  colorZyj: string
  colorDouDou: string
  colorWz: string
}

export function getAuthorColor(
  color?: string | null,
  username?: string,
  styles?: ColorStyles,
): string {
  switch (username) {
    case 'tqy': return styles?.colorTqy ?? ''
    case 'zyj': return styles?.colorZyj ?? ''
    case 'DouDou': return styles?.colorDouDou ?? ''
  }
  switch (color) {
    case 'rainbow': return styles?.colorWz ?? ''
    case '#1a73e8': return styles?.colorTqy ?? ''
    case '#dc2626': return styles?.colorZyj ?? ''
    case '#16a34a': return styles?.colorDouDou ?? ''
    default: return ''
  }
}
