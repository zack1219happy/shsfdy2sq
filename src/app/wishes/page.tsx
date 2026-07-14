'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { fetchAllWishes } from '@/lib/gist-api'
import type { WishItem } from '@/types/wishes'
import { WISH_STATUS_MAP, WISH_TIER_MAP, WISH_TIER_OPTIONS } from '@/types/wishes'
import wishStyles from '@/styles/wishes.module.css'

/* ==============================================================
   许愿池列表页 — 展示所有许愿需求，筛选通过 FilePad + URL 参数
   ============================================================== */

export default function WishesListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [wishes, setWishes] = useState<WishItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tierFilter = searchParams.get('tier') || null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAllWishes(tierFilter || undefined)
      .then((data) => { if (!cancelled) setWishes(data) })
      .catch((e: Error) => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tierFilter])

  const headerTitle = useMemo(() => {
    if (tierFilter) {
      const found = WISH_TIER_OPTIONS.find((t) => t.value === tierFilter)
      if (found) return found.label
    }
    return '所有需求'
  }, [tierFilter])

  const goToWish = useCallback((id: string) => {
    router.push('/wishes/post?id=' + encodeURIComponent(id))
  }, [router])

  return (
    <div className={wishStyles.page}>
      <div className={wishStyles.container}>
        <div className={wishStyles.header}>
          <h1>
            <FaIcon name="coins" /> 许愿池 · {headerTitle}
          </h1>
          <p className={wishStyles.subtitle}>
            想要什么功能？告诉我，我来帮你实现
          </p>
        </div>

        {loading && <p className={wishStyles.loading}>加载中…</p>}
        {error && <p className={wishStyles.error}>❌ {error}</p>}
        {!loading && !error && wishes.length === 0 && (
          <p className={wishStyles.empty}>暂无需求</p>
        )}

        {!loading && !error && wishes.length > 0 && (
          <div className={wishStyles.wishList}>
            {wishes.map((w) => (
              <WishCard key={w.id} wish={w} onClick={() => goToWish(w.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ==============================================================
   WishCard — 许愿卡片
   ============================================================== */

function WishCard({ wish, onClick }: { wish: WishItem; onClick: () => void }) {
  const tierLabel = WISH_TIER_MAP[wish.estimated_tier] || wish.estimated_tier
  const statusLabel = WISH_STATUS_MAP[wish.status] || wish.status

  const tierColors: Record<string, string> = {
    small: '#2ecc40',
    medium: '#f39c12',
    large: '#e74c3c',
  }

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      style={{
        display: 'block',
        padding: '16px 20px',
        borderRadius: 'var(--border-radius)',
        background: 'var(--color-bg)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        marginBottom: 12,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(26, 115, 232, 0.12), 0 0 0 1px rgba(26, 115, 232, 0.15)'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)'
        ;(e.currentTarget as HTMLDivElement).style.transform = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1rem', color: 'var(--color-text)' }}>
              #{String(wish.request_number).padStart(4, '0')}
            </strong>
            {wish.author_username && (
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                @{wish.author_username}
              </span>
            )}
            <span style={{ fontSize: '0.78rem', color: tierColors[wish.estimated_tier] || '#888', fontWeight: 600 }}>
              {tierLabel}
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
              {statusLabel}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {wish.description}
          </p>
        </div>
        {wish.extra_money > 0 && (
          <span style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#dc2626',
            whiteSpace: 'nowrap',
            padding: '2px 8px',
            background: '#fee2e2',
            borderRadius: 'var(--border-radius)',
          }}>
            +¥{wish.extra_money}
          </span>
        )}
      </div>
    </div>
  )
}
