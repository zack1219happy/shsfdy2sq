'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { getSession } from '@/lib/auth'
import { drawFortune, loadFortuneDatesFromDB, todayStr } from '@/lib/fortune'
import { checkIn } from '@/lib/check-in'
import type { FortuneResult } from '@/lib/fortune'
import styles from '@/styles/fortune.module.css'

const FORTUNE_CACHE_KEY = 'fortune_today_v3'

interface CachedFortune {
  date: string
  result: FortuneResult
  streak: number
}

/** 空订阅：仅用于 SSR/hydration 阶段区分客户端挂载状态 */
const emptySubscribe = () => () => {}

/** 读取今日缓存（服务端返回 null），供初始化状态时复用，避免挂载后闪屏 */
function readCachedFortune(): CachedFortune | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(FORTUNE_CACHE_KEY)
    if (!raw) return null
    const cached: CachedFortune = JSON.parse(raw)
    return cached.date === todayStr() ? cached : null
  } catch {
    return null
  }
}

export default function FortuneCard() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [session] = useState<ReturnType<typeof getSession>>(() => getSession())

  // 初始化当日缓存（避免挂载后闪屏），effect 中仍会复核
  const cached = readCachedFortune()
  const [result, setResult] = useState<FortuneResult | null>(cached?.result ?? null)
  const [hasDrawn, setHasDrawn] = useState(!!cached)
  const [streak, setStreak] = useState(cached?.streak ?? 0)

  // 初始化日期数据、缓存复核和跨午夜检测
  useEffect(() => {
    loadFortuneDatesFromDB()

    const checkDay = () => {
      const today = todayStr()
      try {
        const raw = localStorage.getItem(FORTUNE_CACHE_KEY)
        if (raw) {
          const cached: CachedFortune = JSON.parse(raw)
          if (cached.date === today) {
            setResult(cached.result)
            setHasDrawn(true)
            setStreak(cached.streak ?? 0)
            return
          }
        }
      } catch {
        /* ignore parse errors */
      }
      // 新的一天（或无缓存）→ 重置为抽卡状态
      setHasDrawn(false)
      setResult(null)
    }

    checkDay()

    // 跨午夜检测：页面保持打开时日期变更，或从后台切回
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkDay()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const handleDraw = async () => {
    const sess = getSession()
    if (!sess) {
      alert('请先登录再抽卡')
      return
    }

    // 1. 打卡 + 获取连续天数
    let newStreak = 0
    try {
      const r = await checkIn(sess.studentId)
      newStreak = r.streak
    } catch {
      alert('打卡失败，请稍后重试')
      return
    }

    // 2. 抽卡
    const fortune = drawFortune(sess.studentId)
    setResult(fortune)
    setHasDrawn(true)
    setStreak(newStreak)

    // 3. 缓存
    const today = todayStr()
    localStorage.setItem(
      FORTUNE_CACHE_KEY,
      JSON.stringify({ date: today, result: fortune, streak: newStreak }),
    )
  }

  // ── 未登录 / 未挂载（hydration 阶段与 SSR 保持一致，避免 mismatch）──
  if (!mounted || !session) {
    return (
      <div className={`${styles.card} ${styles.idle}`}>
        <div className={styles.inner}>
          <span className={styles.bigIcon}>🎴</span>
          <p className={styles.hint}>登录后点一下抽卡</p>
          <button className={styles.btn} onClick={handleDraw}>
            点一下抽卡
          </button>
        </div>
      </div>
    )
  }

  // ── 已登录但未打卡 ──
  if (!hasDrawn) {
    return (
      <div className={styles.card}>
        <div className={styles.inner}>
          <span className={styles.bigIcon}>🎴</span>
          <p className={styles.hint}>今日运势待开启</p>
          <button className={styles.btn} onClick={handleDraw}>
            打卡抽今日运势
          </button>
        </div>
      </div>
    )
  }

  // ── 已打卡 — 显示结果 ──
  if (!result) return null

  return (
    <div className={styles.card}>
      {/* 连续打卡天数 */}
      <p className={styles.streakText}>
        🔥 连续打卡 <strong>{streak}</strong> 天
      </p>

      {/* 卦象头部 */}
      <div className={styles.resultHeader}>
        <p className={styles.username}>{session.username} 的运势</p>
        <span className={styles.symbol}>{result.hexagram.symbol}</span>
        <p className={`${styles.level} ${styles[`lvl${result.hexagram.level}`]}`}>
          § {result.hexagram.name} · {result.hexagram.level} §
        </p>
      </div>

      <p className={styles.domainTag}>{result.domainLabel}</p>

      {/* 宜 / 忌 */}
      <div className={styles.adviceGrid}>
        <div className={styles.adviceCol}>
          {result.allBad ? (
            <div className={styles.adviceItem}>
              <p className={styles.allBadText}>诸事不宜</p>
              <p className={styles.adviceDetail}>宜休息，忌冲动</p>
            </div>
          ) : (
            result.adviceYi.map((item, i) => (
              <div key={i} className={styles.adviceItem}>
                <p className={styles.adviceLine}>
                  <span className={styles.tagYi}>宜</span> {item.text}
                </p>
                <p className={styles.adviceDetail}>{item.detail}</p>
              </div>
            ))
          )}
        </div>
        <div className={styles.adviceCol}>
          {result.allGood ? (
            <div className={styles.adviceItem}>
              <p className={styles.allGoodText}>诸事皆宜</p>
              <p className={styles.adviceDetail}>今日百无禁忌</p>
            </div>
          ) : (
            result.adviceJi.map((item, i) => (
              <div key={i} className={styles.adviceItem}>
                <p className={styles.adviceLine}>
                  <span className={styles.tagJi}>忌</span> {item.text}
                </p>
                <p className={styles.adviceDetail}>{item.detail}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
