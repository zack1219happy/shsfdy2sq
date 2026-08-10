'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchForumPosts, fetchLikedPostIds, togglePinForumPost } from '@/lib/gist-api'
import type { ForumPost } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import { UserName } from '@/components/UserName'
import styles from '@/styles/forum.module.css'

/* ==============================================================
   论坛列表页
   ============================================================== */

export default function ForumListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loadedTab, setLoadedTab] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const tab = searchParams.get('my') ? 'my' : searchParams.get('liked') ? 'liked' : 'all'
  const loading = loadedTab !== tab

  const loadPosts = useCallback(() => {
    let cancelled = false
    Promise.all([
      fetchForumPosts(),
      tab === 'liked' ? fetchLikedPostIds() : Promise.resolve([]),
    ])
      .then(([data, liked]) => {
        if (cancelled) return
        setPosts(data)
        if (liked.length) setLikedIds(new Set(liked))
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoadedTab(tab) })
    return () => { cancelled = true }
  }, [tab])

  useEffect(() => loadPosts(), [loadPosts])

  // tab 过滤 + 搜索过滤
  const filtered = useMemo(() => {
    const session = getSession()
    let list = posts

    if (tab === 'my') {
      list = list.filter((p) => p.author_id === session?.userId)
    } else if (tab === 'liked') {
      list = list.filter((p) => likedIds.has(p.id) && p.author_id !== session?.userId)
    }

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.author_username.toLowerCase().includes(q),
    )
  }, [posts, searchQuery, tab, likedIds])

  const showSearch = searchOpen || searchQuery.length > 0

  const goToPost = useCallback((id: string) => {
    router.push(`/forum/post?id=${id}`)
  }, [router])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="comments" /> 讨论区</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.searchToggle} ${showSearch ? styles.searchToggleActive : ''}`}
            onClick={() => { setSearchOpen(!showSearch); if (showSearch) setSearchQuery(''); }}
            title="搜索帖子"
          >
            <FaIcon name="search" />
          </button>
        </div>
      </div>

      {showSearch && (
        <div className={styles.searchBar}>
          <FaIcon name="search" className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索标题、内容或作者…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery.trim() && (
            <span className={styles.searchCount}>
              找到 {filtered.length} 条结果
            </span>
          )}
        </div>
      )}

      {loading && <p className={styles.loading}>加载中…</p>}
      {error && <p className={styles.error}>❌ {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className={styles.empty}>
          {searchQuery.trim() ? '没有找到匹配的帖子' : '暂无讨论帖，来发第一篇吧 🚀'}
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (() => {
        const pinned = filtered.filter(p => p.is_pinned)
        const normal = filtered.filter(p => !p.is_pinned)
        return (
          <div className={styles.list}>
            <PinnedSection posts={pinned} goToPost={goToPost} onRefresh={loadPosts} />
            {normal.map(post => (
              <PostCard key={post.id} post={post} onClick={() => goToPost(post.id)} onRefresh={loadPosts} />
            ))}
          </div>
        )
      })()}
    </div>
  )
}

/* ==============================================================
   ContextMenu — 悬浮右键菜单
   ============================================================== */

interface ContextMenuState {
  x: number
  y: number
  postId: string
  isPinned: boolean
}

function ContextMenu({ menu, onClose, onTogglePin }: {
  menu: ContextMenuState
  onClose: () => void
  onTogglePin: (postId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        padding: '4px 0',
        minWidth: 140,
      }}
    >
      <button
        onClick={() => { onTogglePin(menu.postId); onClose() }}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '0.85rem',
          textAlign: 'left',
          color: 'var(--color-text)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        {menu.isPinned ? '📌 取消置顶' : '📌 置顶帖子'}
      </button>
    </div>
  )
}

/* ==============================================================
   PinnedSection — 可折叠的置顶帖子区域
   折叠状态存 localStorage，置顶列表有变化时自动展开
   ============================================================== */

const PIN_KEY = 'forum_pinned_section'

function PinnedSection({ posts, goToPost, onRefresh }: {
  posts: ForumPost[]
  goToPost: (id: string) => void
  onRefresh: () => void
}) {
  const pinKey = useMemo(() => posts.map(p => p.id).sort().join(','), [posts])
  const [collapsed, setCollapsed] = useState(false)

  // 初始化：从 localStorage 恢复，置顶有更新则展开
  useEffect(() => {
    void (async () => {
      try {
        const saved = localStorage.getItem(PIN_KEY)
        if (saved) {
          const data = JSON.parse(saved)
          if (data.pinKey === pinKey) {
            setCollapsed(data.collapsed)
            return
          }
        }
      } catch {}
      setCollapsed(false)
    })()
  }, [pinKey])

  const handleToggle = useCallback(() => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify({ pinKey, collapsed: next }))
    } catch {}
  }, [collapsed, pinKey])

  if (posts.length === 0) return null

  return (
    <div className={styles.pinnedSection}>
      <div
        className={styles.pinnedHeader}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleToggle() }}
      >
        <span><span style={{ fontSize: '0.72rem', opacity: 0.5 }}>{collapsed ? '▸' : '▾'}</span> 📌 {posts.length} 个置顶</span>
      </div>
      {!collapsed && posts.map(post => (
        <PinnedPostCard key={post.id} post={post} onClick={() => goToPost(post.id)} onRefresh={onRefresh} />
      ))}
    </div>
  )
}

function PinnedPostCard({ post, onClick, onRefresh }: {
  post: ForumPost
  onClick: () => void
  onRefresh: () => void
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const session = getSession()
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isAdmin) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, postId: post.id, isPinned: true })
  }, [isAdmin, post.id])

  const handleTogglePin = useCallback(async (postId: string) => {
    try {
      await togglePinForumPost(postId)
      onRefresh()
    } catch {}
  }, [onRefresh])

  return (
    <>
      <div
        className={`${styles.postCard} ${styles.postCardPinned}`}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px' }}
      >
        <div className={styles.postTitle} style={{ marginBottom: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span dangerouslySetInnerHTML={{ __html: renderClient(post.title) }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
          <span>{formatDate(post.created_at)}</span>
          <UserName username={post.author_username} userId={post.author_id} className={styles.postAuthor} />
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onTogglePin={handleTogglePin}
        />
      )}
    </>
  )
}

/* ==============================================================
   PostCard — 帖子卡片
   ============================================================== */

function PostCard({ post, onClick, onRefresh }: { post: ForumPost; onClick: () => void; onRefresh: () => void }) {
  const score = post.upvotes - post.downvotes
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const session = getSession()
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!isAdmin) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, postId: post.id, isPinned: !!post.is_pinned })
  }, [isAdmin, post.id, post.is_pinned])

  const handleTogglePin = useCallback(async (postId: string) => {
    try {
      await togglePinForumPost(postId)
      onRefresh()
    } catch {
      // Silently handle error
    }
  }, [onRefresh])

  return (
    <>
      <div className={styles.postCard}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
        style={contextMenu ? { position: 'relative' } : undefined}
      >
        <div className={styles.postTitle}>
          {post.is_pinned && <span style={{ marginRight: 4 }}>📌</span>}
          <span dangerouslySetInnerHTML={{ __html: renderClient(post.title) }} />
        </div>
        <div className={styles.postMeta}>
          <UserName username={post.author_username} userId={post.author_id} className={styles.postAuthor} />
          <span>{formatDate(post.created_at)}</span>
          <div className={styles.postStats}>
            <span className={`${styles.statBadge} ${score > 0 ? styles.statBadgeUpvoted : ''}`}>
              ️ {score > 0 ? '+' + score : score}
            </span>
          </div>
        </div>
      </div>
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onTogglePin={handleTogglePin}
        />
      )}
    </>
  )
}
