'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { type IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { resolveIcon } from '@/lib/fa-icons'

interface Props {
  /** 图标名：支持 "user"、"fa-user"、"fas fa-user" 三种格式 */
  name: string | IconDefinition
  className?: string
  spin?: boolean
  title?: string
}

/**
 * 统一的图标组件，按需打包 FA 图标，替代 className="fas fa-xxx" 写法
 */
export default function FaIcon({ name, className, spin, title }: Props) {
  const icon = typeof name === 'string' ? resolveIcon(name) : name

  // 找不到图标时显示原始文字，保证不崩
  if (!icon) {
    return (
      <span className={className} title={title}>
        {typeof name === 'string' ? name : '?'}
      </span>
    )
  }

  return (
    <span className={className} title={title}>
      <FontAwesomeIcon icon={icon} spin={spin} />
    </span>
  )
}
