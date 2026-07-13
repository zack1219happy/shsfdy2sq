'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchPlazaArticles } from '@/lib/gist-api'
import { PLAZA_CATEGORIES } from '@/types/plaza'
import type { PlazaArticleListResult } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import styles from '@/styles/plaza.module.css'

/* ==============================================================
   广场列表页
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPlazaArticles(
      category || undefined,
      subCategory || undefined,
      undefined,
      100,
    )
      .then((data) => { if (!cancelled) setArticles(data) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category, subCategory])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return articles
    const q = searchQuery.toLowerCase()
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.author_username.toLowerCase().includes(q),
    )
  }, [articles, searchQuery])

  const goToArticle = useCallback((slug: string) => {
    router.push('/plaza/' + slug)
  }, [router])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="newspaper" /> 文章广场</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`${styles.searchToggle} ${searchOpen ? styles.searchToggleActive : ''}`}
            onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchQuery(''); }}
            title="搜索文章"
          >
            <FaIcon name="search" />
          </button>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={() => router.push('/plaza/new')}
          >
            <FaIcon name="plus" /> 写文章
          </button>
        </div>
      </div>

      {searchOpen && (
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

      {/* 分类筛选 */}
      <div className={styles.categoryFilter}>
        <button
          className={`${styles.catBtn} ${!category && !subCategory ? styles.catBtnActive : ''}`}
          onClick={() => { router.push('/plaza'); window.history.replaceState(null, '', '/plaza') }}
        >
          全部
        </button>
        {PLAZA_CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            className={`${styles.catBtn} ${category === cat.name && !subCategory ? styles.catBtnActive : ''}`}
            onClick={() => {
              router.push(`/plaza?category=${encodeURIComponent(cat.name)}`)
              window.history.replaceState(null, '', `/plaza?category=${encodeURIComponent(cat.name)}`)
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

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
              onClick={() => goToArticle(article.slug)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   ArticleCard
   ============================================================== */

function ArticleCard({ article, onClick }: { article: PlazaArticleListResult; onClick: () => void }) {
  return (
    <div
      className={styles.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <div
        className={styles.cardTitle}
        dangerouslySetInnerHTML={{ __html: renderClient(article.title) }}
      />
      <div className={styles.cardMeta}>
        <UserName username={article.author_username} className={styles.author} />
        <span>{formatDate(article.created_at)}</span>
        <span className={`${styles.badge} ${styles.badgeCategory}`}>{article.category}{article.sub_category ? ` · ${article.sub_category}` : ''}</span>
        {!article.is_public && <span className={`${styles.badge} ${styles.badgePrivate}`}>🔒 私密</span>}
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
