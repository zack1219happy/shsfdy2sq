'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { fetchShopItems, fetchUserPurchases, purchaseItem, fetchMyPoints } from '@/lib/gist-api'
import type { ShopItem } from '@/types/gist'
import styles from '@/styles/points.module.css'

type PageState = 'loading' | 'ready' | 'error'

export default function ShopPage() {
  const router = useRouter()
  const [session, setSession] = useState(getSession())
  const [pageState, setPageState] = useState<PageState>('loading')
  const [items, setItems] = useState<ShopItem[]>([])
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set())
  const [myPoints, setMyPoints] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [buyingId, setBuyingId] = useState<string | null>(null)

  useEffect(() => {
    if (!session) { router.push('/'); return }
    loadShop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadShop = useCallback(async () => {
    setPageState('loading')
    setErrorMsg('')
    try {
      const [itemsData, purchases, points] = await Promise.all([
        fetchShopItems(),
        fetchUserPurchases(),
        fetchMyPoints(),
      ])
      setItems(itemsData)
      setOwnedIds(new Set(purchases.map(p => p.item_id)))
      setMyPoints(points)
      setPageState('ready')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '加载失败')
      setPageState('error')
    }
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
          <button className={styles.pageBtn} onClick={loadShop}>重试</button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={styles.pointsPage}>
        <h2 className={styles.pointsTitle}><FaIcon name="gift" /> 积分商城</h2>
        <div className={styles.shopPlaceholder}>
          <div className={styles.shopPlaceholderIcon}>🏪</div>
          <p className={styles.shopPlaceholderTitle}>暂无商品</p>
          <p className={styles.shopPlaceholderText}>商城正在上架商品，请稍后再来</p>
        </div>
      </div>
    )
  }

  const colors = items.filter(i => i.item_type === 'color')
  const tags = items.filter(i => i.item_type === 'tag')

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

      {tags.length > 0 && (
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
          </div>
        </section>
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
  const canAfford = myPoints >= item.price
  const isCustom = item.value === '__custom__'

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
  return (
    <span
      className={styles.tagPreview}
      style={color ? { color, borderColor: color } : undefined}
    >
      {custom ? '自定义' : value}
    </span>
  )
}
