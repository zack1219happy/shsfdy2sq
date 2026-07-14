'use client'

import { useUserColor } from '@/lib/user-colors'

interface Props {
  username: string
  className?: string
}

/**
 * 渲染带颜色的用户名。
 *
 * 颜色从 wiki_users.color 来（通过 UserColorContext 查找）。
 * 没找到颜色或用户不存在时，渲染纯文本不报错。
 */
export function UserName({ username, className }: Props) {
  const color = useUserColor(username)

  if (!color) {
    return <span className={className}>{username}</span>
  }

  if (color.startsWith('linear-gradient(')) {
    return (
      <span
        className={className}
        style={{
          background: color,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          display: 'inline-block',
        }}
      >
        {username}
      </span>
    )
  }

  return <span className={className} style={{ color }}>{username}</span>
}
