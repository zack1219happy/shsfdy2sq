'use client'

import type React from 'react'
import { useRouter } from 'next/navigation'
import { useUserColor, useUserDecoration } from '@/lib/user-colors'
import { BASE_PATH } from '@/lib/constants'

interface Props {
  username: string
  className?: string
  /** 是否隐藏标签（默认 false = 显示标签） */
  hideTags?: boolean
  /** 是否渲染为可点击链接跳转用户主页（默认 true） */
  link?: boolean
}

/**
 * 渲染带颜色的用户名，默认显示标签徽章，且为可点击链接跳转用户主页。
 *
 * 颜色从 wiki_users.color 来（通过 UserDecorationContext 查找）。
 * 标签包括内置身份 tag（如创始人、工程师）+ 用户已装备的 tag（最多 3 个）。
 * 没找到颜色或用户不存在时，渲染纯文本不报错。
 *
 * 渲染为 `<span>` + onClick 而非 `<a>`/`<Link>`，避免被嵌套在已有
 * `<a>` 中时产生 Hydration 错误。用 stopPropagation 防止触发外层链接。
 */
export function UserName({ username, className, hideTags, link = true }: Props) {
  const router = useRouter()
  const showTags = !hideTags
  const color = useUserColor(username)

  const nameEl = renderName(username, color)

  const content = showTags ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {nameEl}
      <Tags username={username} />
    </span>
  ) : (
    nameEl
  )

  if (!link) {
    return <span className={className}>{content}</span>
  }

  const href = `${BASE_PATH}/user/mypage?user=${encodeURIComponent(username)}`

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('mypage-route-change'))
    router.push(href)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('mypage-route-change'))
      router.push(href)
    }
  }

  return (
    <span
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
      style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
    >
      {content}
    </span>
  )
}

/** 渲染带颜色的用户名文本 */
function renderName(username: string, color: string | null): React.ReactNode {
  if (!color) {
    return <span>{username}</span>
  }
  if (color.startsWith('linear-gradient(')) {
    return (
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
    )
  }
  return <span style={{ color }}>{username}</span>
}

/** 渲染用户的标签徽章 */
function Tags({ username }: { username: string }) {
  const decoration = useUserDecoration(username)
  const tags = decoration?.tags ?? []
  if (tags.length === 0) return null
  return (
    <>
      {tags.map((tag, i) => (
        <TagBadge key={i} text={tag.v} color={tag.c} />
      ))}
    </>
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
  if (text === '社区提案者') {
    return {
      background: 'linear-gradient(135deg, #ef4444, #3b82f6)',
      color: '#ffd700',
      fontWeight: 600,
    }
  }
  return null
}
