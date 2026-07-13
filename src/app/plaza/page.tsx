'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { renderClient } from '@/lib/render-client'
import { fetchPlazaArticles } from '@/lib/gist-api'
import type { PlazaArticleListResult } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import styles from '@/styles/forum.module.css'

/* ==============================================================
   广场列表页 — 文章卡片
   - 支持分类筛选（?category= & ?sub=）和 tab 切换（?my=1 / ?liked=1）
   - 静态度量展示，跟 forum/PostCard 一致
   ============================================================== */

export default function PlazaListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [articles, setArticles] = useState<PlazaArticleListResult[]>([])
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
    const timer = setTimeout(() => {
      setLoading(true)
      fetchPlazaArticles(
        category || undefined,
        subCategory || undefined,
        searchQuery.trim() || undefined,
        100,
        0,
        tab === 'my' ? true : undefined,
        tab === 'liked' ? true : undefined,
      )
        .then((data) => {
          if (cancelled) return
          setArticles(data)
        })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [category, subCategory, tab, searchQuery])

  const displayArticles = articles

  const showSearch = searchOpen || searchQuery.length > 0

  const goToArticle = useCallback((slug: string) => {
    router.push('/plaza/post?slug=' + encodeURIComponent(slug))
  }, [router])

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
            placeholder="搜索标题、内容或作者…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery.trim() && (
            <span className={styles.searchCount}>
              找到 {displayArticles.length} 条结果
            </span>
          )}
        </div>
      )}

      {loading && <p className={styles.loading}>加载中…</p>}
      {error && <p className={styles.error}>❌ {error}</p>}
      {!loading && !error && displayArticles.length === 0 && (
        <p className={styles.empty}>
          {searchQuery.trim() ? '没有找到匹配的文章' : '还没有文章，来发第一篇吧 ✍️'}
        </p>
      )}

      {!loading && !error && displayArticles.length > 0 && (
        <div className={styles.list}>
          {displayArticles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onClick={() => goToArticle(article.slug)}
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

function ArticleCard({ article, onClick }: { article: PlazaArticleListResult; onClick: () => void }) {
  const score = (article.like_count ?? 0) - (article.downvote_count ?? 0)
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
        <div className={styles.postStats}>
          <span className={styles.statBadge}>
            <FaIcon name="thumbs-up" /> {article.like_count ?? 0}
          </span>
          <span className={styles.statBadge}>
            <FaIcon name="thumbs-down" /> {article.downvote_count ?? 0}
          </span>
          <span className={`${styles.statBadge} ${score > 0 ? styles.statBadgeUpvoted : ''}`}>
            ️ {score > 0 ? '+' + score : score}
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
