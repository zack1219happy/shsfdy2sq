'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import {
  fetchShopItems,
  fetchUserPurchases,
  purchaseItem,
  fetchMyPoints,
  fetchTagSubmissions,
  approveTagSubmission,
  rejectTagSubmission,
} from '@/lib/gist-api'
import type { ShopItem, TagSubmission } from '@/types/gist'
import TagSubmissionModal from '@/components/TagSubmissionModal'
import styles from '@/styles/points.module.css'

type PageState = 'loading' | 'ready' | 'error'

export default function ShopPage() {
  const router = useRouter()
  const [session] = useState(getSession())
  const [pageState, setPageState] = useState<PageState>('loading')
  const [items, setItems] = useState<ShopItem[]>([])
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set())
  const [myPoints, setMyPoints] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [buyingId, setBuyingId] = useState<string | null>(null)

  // ── 标签投稿：待审核投稿只在管理员商城内以「正常商品卡片」展示，普通用户不可见 ──
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)
  const [pendingSubs, setPendingSubs] = useState<TagSubmission[]>([])
  const [handlingSubId, setHandlingSubId] = useState<string | null>(null)

  // 投稿弹窗
  const [showSubmitModal, setShowSubmitModal] = useState(false)

  const loadShop = useCallback(async () => {
    await Promise.all([
      fetchShopItems(),
      fetchUserPurchases(),
      fetchMyPoints(),
      isAdmin ? fetchTagSubmissions() : Promise.resolve([]),
    ]).then(([itemsData, purchases, points, subs]) => {
      setItems(itemsData)
      setOwnedIds(new Set(purchases.map(p => p.item_id)))
      setMyPoints(points)
      setPendingSubs((subs ?? []).filter(s => s.status === 'pending'))
      setPageState('ready')
    }).catch((e) => {
      setErrorMsg(e instanceof Error ? e.message : '加载失败')
      setPageState('error')
    })
  }, [isAdmin])

  const handleRetry = useCallback(() => {
    setPageState('loading')
    setErrorMsg('')
    loadShop()
  }, [loadShop])

  useEffect(() => {
    if (!session) { router.push('/'); return }
    loadShop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleBuy = useCallback(async (itemId: string) => {
    setBuyingId(itemId)
    try {
      const result = await purchaseItem(itemId)
      if (result.success) {
        setOwnedIds(prev => new Set(prev).add(itemId))
        setMyPoints(prev => prev - items.find(i => i.id === itemId)!.price)
      }
      // 简单的反馈：刷新购买状态
      const freshPurchases = await fetchUserPurchases()
      setOwnedIds(new Set(freshPurchases.map(p => p.item_id)))
    } catch {
      // ignore
    } finally {
      setBuyingId(null)
    }
  }, [items])

  // ── 审核：同意（上架）──
  const handleApproveSub = useCallback(async (id: string) => {
    setHandlingSubId(id)
    try {
      const res = await approveTagSubmission(id)
      if (!res.success) {
        window.alert('操作失败: ' + res.message)
      } else {
        await loadShop()
      }
    } catch (e) {
      window.alert('操作失败: ' + ((e as { message?: string })?.message || '未知错误'))
    } finally {
      setHandlingSubId(null)
    }
  }, [loadShop])

  // ── 审核：驳回 ──
  const handleRejectSub = useCallback(async (id: string) => {
    setHandlingSubId(id)
    try {
      const res = await rejectTagSubmission(id)
      if (!res.success) {
        window.alert('操作失败: ' + res.message)
      } else {
        await loadShop()
      }
    } catch (e) {
      window.alert('操作失败: ' + ((e as { message?: string })?.message || '未知错误'))
    } finally {
      setHandlingSubId(null)
    }
  }, [loadShop])

  if (!session) return null

  if (pageState === 'loading') {
    return (
      <div className={styles.pointsPage}>
        <h2 className={styles.pointsTitle}><FaIcon name="gift" /> 积分商城</h2>
        <div className={styles.status}><FaIcon name="spinner" spin /> 加载中…</div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className={styles.pointsPage}>
        <h2 className={styles.pointsTitle}><FaIcon name="gift" /> 积分商城</h2>
        <div className={styles.statusError}>
          <p>{errorMsg}</p>
          <button className={styles.pageBtn} onClick={handleRetry}>重试</button>
        </div>
      </div>
    )
  }

  const colors = items.filter(i => i.item_type === 'color')
  const tags = items.filter(i => i.item_type === 'tag')
  const showTagSection = tags.length > 0 || (isAdmin && pendingSubs.length > 0)

  return (
    <div className={styles.pointsPage}>
      <h2 className={styles.pointsTitle}>
        <FaIcon name="gift" /> 积分商城
        <span className={styles.myPointsBadge}>
          <FaIcon name="coins" /> {myPoints}
        </span>
      </h2>

      {colors.length > 0 && (
        <section className={styles.shopSection}>
          <h3 className={styles.shopSectionTitle}>
            <FaIcon name="palette" /> 颜色
          </h3>
          <div className={styles.shopGrid}>
            {colors.map(item => (
              <ShopCard
                key={item.id}
                item={item}
                owned={ownedIds.has(item.id)}
                myPoints={myPoints}
                buying={buyingId === item.id}
                onBuy={handleBuy}
                username={session?.username ?? '用户'}
              />
            ))}
          </div>
        </section>
      )}

      {showTagSection && (
        <section className={styles.shopSection}>
          <h3 className={styles.shopSectionTitle}>
            <FaIcon name="star" /> 标签
          </h3>
          <div className={styles.shopGrid}>
            {tags.map(item => (
              <ShopCard
                key={item.id}
                item={item}
                owned={ownedIds.has(item.id)}
                myPoints={myPoints}
                buying={buyingId === item.id}
                onBuy={handleBuy}
              />
            ))}
            {/* 管理员：待审核投稿以正常商品卡片展示，按钮换成「同意」「驳回」 */}
            {isAdmin && pendingSubs.map(sub => (
              <PendingSubCard
                key={sub.id}
                sub={sub}
                handling={handlingSubId === sub.id}
                onApprove={() => handleApproveSub(sub.id)}
                onReject={() => handleRejectSub(sub.id)}
              />
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && pendingSubs.length === 0 && (
        <div className={styles.shopPlaceholder}>
          <div className={styles.shopPlaceholderIcon}>🏪</div>
          <p className={styles.shopPlaceholderTitle}>暂无商品</p>
          <p className={styles.shopPlaceholderText}>商城正在上架商品，请稍后再来</p>
        </div>
      )}

      {/* 标签投稿入口 */}
      <section className={styles.shopSection}>
        <button
          className={styles.appearanceSubmitTagBtn}
          onClick={() => setShowSubmitModal(true)}
        >
          <FaIcon name="lightbulb" /> 没有想要的标签？投稿一个！
        </button>
      </section>

      {showSubmitModal && (
        <TagSubmissionModal onClose={() => setShowSubmitModal(false)} />
      )}
    </div>
  )
}

/* ==============================================================
   ShopCard — 单个商品卡片
   ============================================================== */

function ShopCard({
  item,
  owned,
  myPoints,
  buying,
  onBuy,
  username,
}: {
  item: ShopItem
  owned: boolean
  myPoints: number
  buying: boolean
  onBuy: (id: string) => void
  username?: string
}) {
  const isCustom = item.value === '__custom__'
  const isPioneer = item.value === '开拓者'

  // 开拓者促销：8.1 前 ≥50 积分免费获取
  const pioneerActive = isPioneer && new Date() < new Date('2026-08-01T00:00:00+08:00')
  const pioneerExpired = isPioneer && !pioneerActive
  const canAfford = isPioneer ? myPoints >= 50 : myPoints >= item.price

  if (pioneerExpired && !owned) return null // 过期后不显示

  return (
    <div className={`${styles.shopCard} ${owned ? styles.shopCardOwned : ''}`}>
      {/* 预览区 */}
      <div className={styles.shopPreview}>
        {item.item_type === 'color' ? (
          <ColorPreview value={item.value} name={item.name} username={username} />
        ) : (
          <TagPreview value={item.value} color={item.tag_color} custom={isCustom} />
        )}
      </div>

      {/* 商品名称 */}
      <div className={styles.shopCardName}>
        {isCustom ? '自定义灰色' : item.name}
      </div>

      {/* 价格 & 按钮 */}
      <div className={styles.shopCardFooter}>
        {owned ? (
          <span className={styles.shopOwnedBadge}>已拥有</span>
        ) : pioneerActive ? (
          <>
            <span className={styles.shopPrice}>
              ≥50积分 <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>免费</span>
            </span>
            <button
              className={styles.shopBuyBtn}
              disabled={!canAfford || buying}
              onClick={() => onBuy(item.id)}
            >
              {buying ? '…' : !canAfford ? '积分不足' : '免费获取'}
            </button>
          </>
        ) : (
          <>
            <span className={styles.shopPrice}>
              <FaIcon name="coins" /> {item.price}
            </span>
            <button
              className={styles.shopBuyBtn}
              disabled={!canAfford || buying}
              onClick={() => onBuy(item.id)}
            >
              {buying ? '…' : !canAfford ? '积分不足' : '购买'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ==============================================================
   PendingSubCard — 待审核投稿卡片（仅管理员可见）
   样式与普通商品一致，仅按钮换成「同意」「驳回」
   ============================================================== */

function PendingSubCard({
  sub,
  handling,
  onApprove,
  onReject,
}: {
  sub: TagSubmission
  handling: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className={styles.shopCard} data-pending-sub>
      {/* 预览区 */}
      <div className={styles.shopPreview}>
        <TagPreview value={sub.value} color={sub.tag_color} custom={false} />
      </div>

      {/* 商品名称 */}
      <div className={styles.shopCardName}>{sub.value}</div>

      {/* 价格 & 按钮 */}
      <div className={styles.shopCardFooter}>
        <span className={styles.shopPrice}>
          <FaIcon name="coins" /> {sub.price}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button
            className={`${styles.subIconBtn} ${styles.subRejectBtn}`}
            disabled={handling}
            onClick={onReject}
            title="驳回"
            aria-label="驳回"
          >
            <FaIcon name="times" />
          </button>
          <button
            className={`${styles.subIconBtn} ${styles.subApproveBtn}`}
            disabled={handling}
            onClick={onApprove}
            title="同意"
            aria-label="同意"
          >
            {handling ? <FaIcon name="spinner" spin /> : <FaIcon name="check" />}
          </button>
        </span>
      </div>
    </div>
  )
}

/** 颜色预览 — 用你的用户名模拟着色效果 */
function ColorPreview({ value, name, username }: { value: string; name: string; username?: string }) {
  const isGradient = value.startsWith('linear-gradient(')
  return (
    <div className={styles.colorPreviewWrap} title={name}>
      <span
        className={styles.colorPreviewText}
        style={
          isGradient
            ? {
                background: value,
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block',
              }
            : { color: value }
        }
      >
        {username ?? '用户'}
      </span>
    </div>
  )
}

/** 标签预览 */
function TagPreview({ value, color, custom }: { value: string; color: string | null; tag_color?: string; custom: boolean }) {
  const isPioneer = value === '开拓者'
  const borderColor = extractPreviewColor(color)
  return (
    <span
      className={styles.tagPreview}
      style={isPioneer ? {
        background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #b45309)',
        color: '#fff',
        fontWeight: 700,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        border: 'none',
      } : borderColor ? { color: borderColor, borderColor } : undefined}
    >
      {custom ? '自定义' : value}
    </span>
  )
}

/**
 * 提取可作边框/文字色的单一颜色。
 * 渐变色（linear/radial-gradient）不能作 border-color/color，取第一个颜色值兜底；
 * 普通色（#hex / rgb()/rgba()）直接使用。
 */
function extractPreviewColor(color: string | null): string | null {
  if (!color) return null
  if (color.startsWith('linear-gradient(') || color.startsWith('radial-gradient(')) {
    const m = color.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)
    return m ? m[0] : null
  }
  return color
}
