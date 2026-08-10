'use client'

import type React from 'react'
import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useUserById, useUserDecoration, useDecorationsLoaded, type UserDecoration } from '@/lib/user-colors'

interface Props {
  username: string
  /** 用户 ID（推荐提供）。提供后按 ID 解析当前用户名与装扮，用户改过名依然正确。 */
  userId?: string | null
  className?: string
  /** 是否隐藏标签（默认 false = 显示标签） */
  hideTags?: boolean
  /** 是否渲染为可点击链接跳转用户主页（默认 true） */
  link?: boolean
}

/**
 * 渲染带颜色的用户名，默认显示标签徽章，且为可点击链接跳转用户主页。
 *
 * 颜色/标签/当前用户名从 wiki_users 来（通过 UserDecorationContext 查找）。
 * 有 userId 时优先按 userId 定位（历史内容快照的旧用户名也能对上当前用户）；
 * 否则回退到按当前用户名解析。解析不到（匿名、未收录用户）时渲染纯文本不报错。
 *
 * 渲染为 `<span>` + onClick 而非 `<a>`/`<Link>`，避免被嵌套在已有
 * `<a>` 中时产生 Hydration 错误。用 stopPropagation 防止触发外层链接。
 */
export function UserName({ username, userId, className, hideTags, link = true }: Props) {
  const router = useRouter()
  const showTags = !hideTags
  // 装饰数据是否已预拉取完成（用于「加载中」占位）
  const loaded = useDecorationsLoaded()

  // 两个 hook 都必须无条件调用；有 userId 时按 ID 解析，否则回退到当前用户名解析
  const byIdDeco = useUserById(userId)
  const byNameDeco = useUserDecoration(username)
  const decoration = byIdDeco ?? byNameDeco
  const color = decoration?.color ?? null
  // 显示的文本：优先用当前用户名（改名后自动跟随），解析不到时用传入的 username
  const displayName = decoration?.username ?? username

  // 渐变名字兜底：background-clip:text 不支持的浏览器退回纯色/纯文本，
  // 避免出现"透明文字 + 渐变块"的方块（useSyncExternalStore：无 effect 的惰性能力检测）
  const gradientClipSupported = useSyncExternalStore(
    emptySubscribe,
    () => supportsTextClip(),
    () => true,
  )

  // 装饰数据尚未预拉取完成：此时解析不到不代表用户不存在，显示「加载中」占位
  const loadingName = !loaded && !decoration
  const nameEl = loadingName ? <span>加载中</span> : renderName(displayName, color, gradientClipSupported)

  const content = showTags ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {nameEl}
      {/* 标签容器带稳定类名，供列表页手机端媒体查询隐藏 */}
      <span className="userName-tags">
        <Tags decoration={decoration} />
      </span>
    </span>
  ) : (
    nameEl
  )

  if (!link) {
    return <span className={className}>{content}</span>
  }

  // router.push 自动处理 basePath，不要加 BASE_PATH 前缀
  const path = `/user/mypage?user=${encodeURIComponent(userId ?? username)}`

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    router.push(path)
    window.dispatchEvent(new CustomEvent('mypage-route-change'))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      router.push(path)
      window.dispatchEvent(new CustomEvent('mypage-route-change'))
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
function renderName(username: string, color: string | null, gradientClipSupported: boolean): React.ReactNode {
  if (!color) {
    return <span>{username}</span>
  }
  if (color.startsWith('linear-gradient(')) {
    // 浏览器不支持 background-clip:text 时，若强行渐变 + 透明文字会渲染成渐变方块。
    // 退回纯色文本（取渐变中第一个 hex/rgb 色，无法解析时用默认文本色）。
    if (!gradientClipSupported) {
      const fallback = extractFirstColor(color)
      return <span style={fallback ? { color: fallback } : undefined}>{username}</span>
    }
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

/** 从 linear-gradient 字符串中提取第一个颜色值（#hex 或 rgb()/rgba()） */
function extractFirstColor(gradient: string): string | null {
  const m = gradient.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)
  return m ? m[0] : null
}

/** 渲染用户的标签徽章 */
function Tags({ decoration }: { decoration: UserDecoration | null }) {
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

// ---- useSyncExternalStore 辅助：渐变 text-clip 能力检测 ----

/** 空订阅（能力检测不变化，无需监听） */
function emptySubscribe(): () => void {
  return () => {}
}

/** 客户端能力检测：是否支持 background-clip:text（含 -webkit- 前缀） */
function supportsTextClip(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('background-clip', 'text') || CSS.supports('-webkit-background-clip', 'text'))
  )
}
