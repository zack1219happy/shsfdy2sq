'use client'

import type React from 'react'
import { useUserColor, useUserDecoration } from '@/lib/user-colors'

interface Props {
  username: string
  className?: string
  /** 是否隐藏标签（默认 false = 显示标签） */
  hideTags?: boolean
}

/**
 * 渲染带颜色的用户名，默认显示标签徽章。
 *
 * 颜色从 wiki_users.color 来（通过 UserDecorationContext 查找）。
 * 标签包括内置身份 tag（如创始人、工程师）+ 用户已装备的 tag（最多 3 个）。
 * 没找到颜色或用户不存在时，渲染纯文本不报错。
 */
export function UserName({ username, className, hideTags }: Props) {
  const showTags = !hideTags
  const color = useUserColor(username)

  if (!showTags) {
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

  // ---- 带标签渲染 ----
  const decoration = useUserDecoration(username)
  const tags = decoration?.tags ?? []

  const nameEl = color ? (
    color.startsWith('linear-gradient(') ? (
      <span
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
    ) : (
      <span style={{ color }}>{username}</span>
    )
  ) : (
    <span>{username}</span>
  )

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {nameEl}
      {tags.map((tag, i) => (
        <TagBadge key={i} text={tag.v} color={tag.c} />
      ))}
    </span>
  )
}

/** 单个标签徽章（小圆角胶囊） */
function TagBadge({ text, color }: { text: string; color?: string | null }) {
  const builtinStyle = getTagBuiltinStyle(text)
  const tagStyle = builtinStyle ?? (color
    ? { color, border: `1px solid ${color}` }
    : { background: 'var(--color-active-bg)', color: 'var(--color-text-secondary)' }
  )
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.68rem',
        fontWeight: 500,
        padding: '0 6px',
        borderRadius: 999,
        lineHeight: '1.6',
        whiteSpace: 'nowrap',
        ...tagStyle,
      }}
    >
      {text}
    </span>
  )
}

/** 内置身份 tag 的特殊样式 — 返回 null 表示非内置 tag */
function getTagBuiltinStyle(text: string): React.CSSProperties | null {
  if (text === '创始人') {
    return { background: '#000', color: '#fff' }
  }
  if (text === '工程师') {
    return {
      background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
      color: '#fff',
    }
  }
  if (text === '开拓者') {
    return {
      background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #b45309)',
      color: '#fff',
      fontWeight: 700,
      textShadow: '0 1px 2px rgba(0,0,0,0.3)',
    }
  }
  return null
}
