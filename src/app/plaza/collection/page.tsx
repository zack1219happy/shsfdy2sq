'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { fetchPlazaCollection } from '@/lib/api/plaza'
import { formatDate } from '@/lib/forum'
import { renderMarkdown } from '@/lib/markdown'
import type { PlazaArticleListResult, PlazaCollectionDetail } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import styles from '@/styles/forum.module.css'

export default function PlazaCollectionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authorId = searchParams.get('author_id') || ''
  const prefix = searchParams.get('prefix') || ''
  const hasIdentifier = Boolean(authorId && prefix)
  const [collection, setCollection] = useState<PlazaCollectionDetail | null>(null)
  const [loading, setLoading] = useState(hasIdentifier)
  const [error, setError] = useState<string | null>(hasIdentifier ? null : '缺少集锦标识')

  useEffect(() => {
    if (!hasIdentifier) return

    let cancelled = false
    fetchPlazaCollection(authorId, prefix)
      .then((data) => { if (!cancelled) setCollection(data) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [authorId, prefix, hasIdentifier])

  const goToArticle = (article: PlazaArticleListResult) => {
    const params = new URLSearchParams({
      slug: article.slug,
      from: 'collection',
      collection_author_id: authorId,
      collection_prefix: prefix,
    })
    router.push('/plaza/post?' + params.toString())
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="newspaper" /> 集锦{collection ? `：${collection.collection_title}` : ''}</h2>
        <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => router.push('/plaza')}>
          ← 返回文章广场
        </button>
      </div>

      {loading && <p className={styles.loading}>加载中…</p>}
      {error && <p className={styles.error}>❌ {error}</p>}

      {!loading && !error && collection && (
        <>
          <div className={styles.collectionIntro}>
            <div className={styles.collectionIntroTitle}>
              <span className={styles.collectionBadge}>集锦</span>
              <span dangerouslySetInnerHTML={{ __html: renderMarkdown(collection.collection_title) }} />
            </div>
            <div className={styles.postMeta}>
              <UserName
                username={collection.author_username}
                userId={collection.author_id}
                className={styles.postAuthor}
              />
              <span>{collection.article_count} 篇文章</span>
            </div>
          </div>

          <div className={styles.list}>
            {collection.articles.map((article) => (
              <CollectionArticleCard
                key={article.id}
                article={article}
                onClick={() => goToArticle(article)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CollectionArticleCard({ article, onClick }: { article: PlazaArticleListResult; onClick: () => void }) {
  const score = (article.like_count ?? 0) - (article.downvote_count ?? 0)
  const session = getSession()
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  return (
    <div
      className={styles.postCard}
      data-plaza-collection-article="true"
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
        <span>发布于 {formatDate(article.created_at)}</span>
        {article.updated_at !== article.created_at && <span>更新于 {formatDate(article.updated_at)}</span>}
        {!article.is_public && <span style={{ color: '#b35a00', fontSize: '0.78rem' }}>🔒 私密</span>}
        <div className={styles.postStats}>
          <span className={`${styles.statBadge} ${score > 0 ? styles.statBadgeUpvoted : ''}`}>
            {score > 0 ? '+' + score : score}
          </span>
        </div>
      </div>
    </div>
  )
}
