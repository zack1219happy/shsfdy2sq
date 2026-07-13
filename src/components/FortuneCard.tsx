'use client'

import { useState, useEffect } from 'react'
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

export default function FortuneCard() {
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null)
  const [result, setResult] = useState<FortuneResult | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [streak, setStreak] = useState(0)

  // 初始化 session、缓存和日期数据
  useEffect(() => {
    loadFortuneDatesFromDB()
    setSession(getSession())

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

  // ── 未登录 ──
  if (!session) {
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
        <p className={styles.username}>{session.name} 的运势</p>
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
