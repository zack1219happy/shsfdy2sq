'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchForumPosts, fetchLikedPostIds } from '@/lib/gist-api'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const tab = searchParams.get('my') ? 'my' : searchParams.get('liked') ? 'liked' : 'all'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab])

  // tab 过滤 + 搜索过滤
  const filtered = useMemo(() => {
    const session = getSession()
    let list = posts

    if (tab === 'my') {
      list = list.filter((p) => p.author_username === session?.username)
    } else if (tab === 'liked') {
      list = list.filter((p) => likedIds.has(p.id) && p.author_username !== session?.username)
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

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.list}>
          {filtered.map((post) => (
            <PostCard key={post.id} post={post} onClick={() => goToPost(post.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   PostCard — 帖子卡片
   ============================================================== */

function PostCard({ post, onClick }: { post: ForumPost; onClick: () => void }) {
  const score = post.upvotes - post.downvotes
  return (
    <div className={styles.postCard} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}>
      <div className={styles.postTitle} dangerouslySetInnerHTML={{ __html: renderClient(post.title) }} />
      <div className={styles.postMeta}>
        <UserName username={post.author_username} className={styles.postAuthor} />
        <span>{formatDate(post.created_at)}</span>
        <div className={styles.postStats}>
          <span className={styles.statBadge}>
            <FaIcon name="thumbs-up" /> {post.upvotes}
          </span>
          <span className={styles.statBadge}>
            <FaIcon name="thumbs-down" /> {post.downvotes}
          </span>
          <span className={`${styles.statBadge} ${score > 0 ? styles.statBadgeUpvoted : ''}`}>
            ️ {score > 0 ? '+' + score : score}
          </span>
        </div>
      </div>
    </div>
  )
}
