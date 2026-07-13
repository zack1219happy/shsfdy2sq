'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchPlazaArticles, fetchLikedPlazaIds, votePlazaArticle, removePlazaVote } from '@/lib/gist-api'
import type { PlazaArticleListResult } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import styles from '@/styles/forum.module.css'

/* ==============================================================
   广场列表页 — 文章卡片
   - 支持分类筛选（?category= & ?sub=）和 tab 切换（?my=1 / ?liked=1）
   - 点赞按钮在卡片内联，乐观更新
   ============================================================== */

export default function PlazaListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [articles, setArticles] = useState<PlazaArticleListResult[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const category = searchParams.get('category') || null
  const subCategory = searchParams.get('sub') || null
  const tab = searchParams.get('my') ? 'my' : searchParams.get('liked') ? 'liked' : 'all'

  // 根据当前筛选动态标题
  const headerTitle = useMemo(() => {
    if (subCategory) return subCategory
    if (category) return category
    if (tab === 'my') return '我写的'
    if (tab === 'liked') return '我赞的'
    return '文章广场'
  }, [category, subCategory, tab])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchPlazaArticles(
        category || undefined,
        subCategory || undefined,
        undefined,
        100,
        0,
        tab === 'my' ? true : undefined,
        tab === 'liked' ? true : undefined,
      ),
      tab !== 'my' ? fetchLikedPlazaIds() : Promise.resolve([]),
    ])
      .then(([data, liked]) => {
        if (cancelled) return
        setArticles(data)
        if (liked.length) setLikedIds(new Set(liked))
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category, subCategory, tab])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return articles
    const q = searchQuery.toLowerCase()
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.author_username.toLowerCase().includes(q),
    )
  }, [articles, searchQuery])

  const showSearch = searchOpen || searchQuery.length > 0

  const goToArticle = useCallback((slug: string) => {
    router.push('/plaza/post?slug=' + encodeURIComponent(slug))
  }, [router])

  const handleLike = useCallback(async (e: React.MouseEvent, articleId: string) => {
    e.stopPropagation()
    // 先判定当前是否已赞
    const wasLiked = likedIds.has(articleId)
    // 乐观更新
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (wasLiked) next.delete(articleId)
      else next.add(articleId)
      return next
    })
    setArticles((prev) =>
      prev.map((a) =>
        a.id === articleId
          ? { ...a, like_count: wasLiked ? Math.max(0, a.like_count - 1) : a.like_count + 1 }
          : a,
      ),
    )
    try {
      if (wasLiked) {
        await removePlazaVote(articleId)
      } else {
        await votePlazaArticle(articleId, 'up')
      }
    } catch {
      // 回滚
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.add(articleId)
        else next.delete(articleId)
        return next
      })
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId
            ? { ...a, like_count: wasLiked ? a.like_count + 1 : Math.max(0, a.like_count - 1) }
            : a,
        ),
      )
    }
  }, [likedIds])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="newspaper" /> {headerTitle}</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.searchToggle} ${showSearch ? styles.searchToggleActive : ''}`}
            onClick={() => { setSearchOpen(!showSearch); if (showSearch) setSearchQuery(''); }}
            title="搜索文章"
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
            placeholder="搜索标题或作者…"
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
          {searchQuery.trim() ? '没有找到匹配的文章' : '还没有文章，来发第一篇吧 ✍️'}
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.list}>
          {filtered.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              liked={likedIds.has(article.id)}
              onClick={() => goToArticle(article.slug)}
              onLike={(e) => handleLike(e, article.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   ArticleCard — 文章卡片
   复用论坛 postCard 样式，带内联赞按钮和点赞数
   ============================================================== */

function ArticleCard({
  article,
  liked,
  onClick,
  onLike,
}: {
  article: PlazaArticleListResult
  liked: boolean
  onClick: () => void
  onLike: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className={styles.postCard}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <div
        className={styles.postTitle}
        dangerouslySetInnerHTML={{ __html: renderClient(article.title) }}
      />
      <div className={styles.postMeta}>
        <UserName username={article.author_username} className={styles.postAuthor} />
        <span>{formatDate(article.created_at)}</span>
        {!article.is_public && <span style={{ color: '#b35a00', fontSize: '0.78rem' }}>🔒 私密</span>}
        <span className={styles.statBadge}>💬 {article.comment_count ?? 0}</span>
        <div className={styles.postStats}>
          <button
            className={`${styles.voteIcon} ${liked ? styles.voteIconActiveUp : ''}`}
            onClick={onLike}
            title={liked ? '取消赞' : '赞'}
          >
            <FaIcon name="thumbs-up" />
          </button>
          <span className={`${styles.voteCount} ${(article.like_count ?? 0) > 0 ? styles.voteCountPositive : ''}`}>
            {article.like_count ?? 0}
          </span>
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString('zh-CN')
}
