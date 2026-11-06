'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { renderMarkdown } from '@/lib/markdown'
import { getSession } from '@/lib/auth'
import { fetchPlazaCategories, fetchPlazaFeed, type PlazaFeedSort } from '@/lib/api/plaza'
import { formatDate } from '@/lib/forum'
import type { PlazaArticleFeedItem, PlazaArticleListResult, PlazaCategory, PlazaCollectionFeedItem, PlazaFeedItem } from '@/types/plaza'
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
  const [items, setItems] = useState<PlazaFeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sort, setSort] = useState<PlazaFeedSort>('created_at:desc')
  const [expandCollections, setExpandCollections] = useState(false)
  const [categories, setCategories] = useState<PlazaCategory[]>([])

  const categoryId = searchParams.get('category_id') || null
  const tab = searchParams.get('my') ? 'my' : searchParams.get('liked') ? 'liked' : 'all'

  // 加载分类（用于显示标题）
  useEffect(() => {
    fetchPlazaCategories().then(setCategories).catch(() => {})
  }, [])

  // 根据当前筛选动态标题
  const headerTitle = useMemo(() => {
    if (categoryId) {
      const cat = categories.find((c) => c.id === categoryId)
      if (cat) return cat.name
    }
    if (tab === 'my') return '我写的'
    if (tab === 'liked') return '我赞的'
    return '文章广场'
  }, [categoryId, categories, tab])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      fetchPlazaFeed(
        categoryId || undefined,
        searchQuery.trim() || undefined,
        200,
        0,
        tab === 'my' ? true : undefined,
        tab === 'liked' ? true : undefined,
        sort,
        expandCollections,
      )
        .then((data) => {
          if (cancelled) return
          setItems(data)
        })
        .catch((e: Error) => { if (!cancelled) setError(e.message) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [categoryId, tab, searchQuery, sort, expandCollections])

  const displayItems = items

  const showSearch = searchOpen || searchQuery.length > 0

  const goToArticle = useCallback((article: PlazaArticleFeedItem) => {
    const params = new URLSearchParams({ slug: article.slug })
    if (article.collection_author_id && article.collection_prefix) {
      params.set('from', 'collection')
      params.set('collection_author_id', article.collection_author_id)
      params.set('collection_prefix', article.collection_prefix)
    }
    router.push('/plaza/post?' + params.toString())
  }, [router])

  const goToCollection = useCallback((item: PlazaCollectionFeedItem) => {
    const params = new URLSearchParams({
      author_id: item.collection_author_id,
      prefix: item.collection_prefix,
    })
    router.push('/plaza/collection?' + params.toString())
  }, [router])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="newspaper" /> {headerTitle}</h2>
        <div className={styles.headerActions}>
          <select
            className={`${styles.btn} ${styles.btnOutline}`}
            aria-label="文章排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value as PlazaFeedSort)}
            style={{ minWidth: 0, maxWidth: 230 }}
          >
            <option value="created_at:desc">发布时间：新到旧</option>
            <option value="created_at:asc">发布时间：旧到新</option>
            <option value="updated_at:desc">编辑时间：新到旧</option>
            <option value="updated_at:asc">编辑时间：旧到新</option>
            <option value="latest_comment:desc">最新评论：新到旧</option>
            <option value="latest_comment:asc">最新评论：旧到新</option>
            <option value="likes:desc">点赞量：高到低</option>
            <option value="likes:asc">点赞量：低到高</option>
          </select>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => setExpandCollections((expanded) => !expanded)}
            aria-pressed={expandCollections}
          >
            {expandCollections ? '折叠成集锦' : '全部展开'}
          </button>
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
              找到 {displayItems.length} 条结果
            </span>
          )}
        </div>
      )}

      {loading && <p className={styles.loading}>加载中…</p>}
      {error && <p className={styles.error}>❌ {error}</p>}
      {!loading && !error && displayItems.length === 0 && (
        <p className={styles.empty}>
          {searchQuery.trim() ? '没有找到匹配的文章或集锦' : '还没有文章，来发第一篇吧 ✍️'}
        </p>
      )}

      {!loading && !error && displayItems.length > 0 && (
        <div className={styles.list}>
          {displayItems.map((item) => (
            item.result_type === 'collection' ? (
              <CollectionCard
                key={item.collection_key}
                collection={item}
                onClick={() => goToCollection(item)}
              />
            ) : (
              <ArticleCard
                key={item.id}
                article={item}
                onClick={() => goToArticle(item)}
              />
            )
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
  const session = getSession()
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)
  return (
    <div
      className={styles.postCard}
      data-plaza-result-type="article"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <div className={styles.postTitle} style={{ position: 'relative' }}>
        <span dangerouslySetInnerHTML={{ __html: renderMarkdown(article.title) }} />
        {isAdmin && article.is_awarded && (
          <span style={{ position: 'absolute', top: 0, right: 0, fontSize: '0.72rem', opacity: 0.45, lineHeight: 1 }}>
            🏅
          </span>
        )}
      </div>
      <div className={styles.postMeta}>
        <UserName username={article.author_username} userId={article.author_id} className={styles.postAuthor} />
        <span>{formatDate(article.created_at)}</span>
        {!article.is_public && <span style={{ color: '#b35a00', fontSize: '0.78rem' }}>🔒 私密</span>}
        <div className={styles.postStats}>
          <span className={`${styles.statBadge} ${score > 0 ? styles.statBadgeUpvoted : ''}`}>
            ️ {score > 0 ? '+' + score : score}
          </span>
        </div>
      </div>
    </div>
  )
}

function CollectionCard({ collection, onClick }: { collection: PlazaCollectionFeedItem; onClick: () => void }) {
  return (
    <div
      className={styles.postCard}
      data-plaza-result-type="collection"
      data-collection-prefix={collection.collection_title}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <div className={styles.postTitle}>
        <span className={styles.collectionBadge}>集锦</span>
        <span dangerouslySetInnerHTML={{ __html: renderMarkdown(collection.collection_title) }} />
      </div>
      <div className={styles.collectionLatestTitle}>
        最新文章：<span dangerouslySetInnerHTML={{ __html: renderMarkdown(collection.collection_latest_article_title) }} />
      </div>
      <div className={styles.postMeta}>
        <UserName
          username={collection.collection_author_username}
          userId={collection.collection_author_id}
          className={styles.postAuthor}
        />
        <span>{collection.collection_article_count} 篇文章</span>
        <span>更新于 {formatDate(collection.updated_at)}</span>
      </div>
    </div>
  )
}
