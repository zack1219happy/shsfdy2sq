'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchForumPosts } from '@/lib/gist-api'
import type { ForumPost } from '@/types/gist'
import { formatDate, getAuthorColor } from '@/lib/forum'
import styles from '@/styles/forum.module.css'

/* ==============================================================
   论坛列表页
   ============================================================== */

export default function ForumListPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchForumPosts()
      .then((data) => { if (!cancelled) setPosts(data) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // 客户端搜索过滤
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return posts
    const q = searchQuery.toLowerCase()
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.author_username.toLowerCase().includes(q),
    )
  }, [posts, searchQuery])

  const showSearch = searchOpen || searchQuery.length > 0

  const goToPost = useCallback((id: string) => {
    router.push(`/forum/post/${id}`)
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
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => router.push('/forum/new')}>
            <FaIcon name="plus" /> 发帖
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
        <span className={`${styles.postAuthor} ${getAuthorColor(post.author_color, post.author_username, styles as any)}`}>
          {post.author_username}
        </span>
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
          <span className={styles.statBadge}>
            💬 {post.comment_count}
          </span>
        </div>
      </div>
    </div>
  )
}
