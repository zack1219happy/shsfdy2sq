'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { fetchTodayProgress, fetchPointsHistory } from '@/lib/gist-api'
import type { TodayProgress, PointsTransaction } from '@/types/gist'
import { POINTS_REASON_LABEL } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/points.module.css'

const PAGE_SIZE = 20

export default function PointsPage() {
  const router = useRouter()
  const [session, setSession] = useState<ReturnType<typeof getSession>>(null)
  const [progress, setProgress] = useState<TodayProgress | null>(null)
  const [history, setHistory] = useState<PointsTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    setSession(s)
  }, [router])

  // 加载今日进度
  const loadProgress = useCallback(async () => {
    try {
      const p = await fetchTodayProgress()
      setProgress(p)
    } catch {
      // 静默处理
    }
  }, [])

  // 加载积分历史
  const loadHistory = useCallback(async (pageOffset: number) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPointsHistory(PAGE_SIZE, pageOffset)
      if (pageOffset === 0) {
        setHistory(data)
      } else {
        setHistory((prev) => [...prev, ...data])
      }
      setHasMore(data.length === PAGE_SIZE)
    } catch (e: any) {
      setError(e.message ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    loadProgress()
    loadHistory(0)
  }, [session, loadProgress, loadHistory])

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE
    setOffset(newOffset)
    loadHistory(newOffset)
  }

  if (!session) return null

  return (
    <div className={styles.pointsPage}>
      <h2 className={styles.pointsTitle}>
        <FaIcon name="coins" /> 我的积分
      </h2>

      {/* 积分概览 + 今日任务 */}
      <div className={styles.overviewCard}>
        <div className={styles.totalPoints}>
          <span className={styles.totalPointsLabel}>总积分</span>
          <span className={styles.totalPointsValue}>
            {progress?.total_points ?? '—'}
          </span>
        </div>

        <div className={styles.tasksSection}>
          <p className={styles.tasksTitle}>今日任务</p>

          {/* 打卡 */}
          <div className={`${styles.taskItem} ${progress?.checked_in ? styles.taskDone : ''}`}>
            <div className={styles.taskLeft}>
              <span className={styles.taskIcon}>{progress?.checked_in ? '✅' : '⬜'}</span>
              <span className={styles.taskName}>打卡</span>
            </div>
            <span className={styles.taskRight}>每日 1 次</span>
          </div>

          {/* 评论 */}
          <div className={`${styles.taskItem} ${(progress?.comments_today ?? 0) >= 3 ? styles.taskDone : ''}`}>
            <div className={styles.taskLeft}>
              <span className={styles.taskIcon}>{(progress?.comments_today ?? 0) >= 3 ? '✅' : '⬜'}</span>
              <span className={styles.taskName}>评论</span>
              <span className={styles.taskProgress}>
                {progress?.comments_today ?? 0}/3
              </span>
            </div>
            <span className={styles.taskRight}>
              <span className={styles.taskPoints}>+2</span> 分/条
            </span>
          </div>

          {/* 发帖 */}
          <div className={`${styles.taskItem} ${(progress?.posts_today ?? 0) >= 1 ? styles.taskDone : ''}`}>
            <div className={styles.taskLeft}>
              <span className={styles.taskIcon}>{(progress?.posts_today ?? 0) >= 1 ? '✅' : '⬜'}</span>
              <span className={styles.taskName}>发帖</span>
              <span className={styles.taskProgress}>
                {progress?.posts_today ?? 0}/1
              </span>
            </div>
            <span className={styles.taskRight}>
              <span className={styles.taskPoints}>+5</span>
            </span>
          </div>
        </div>
      </div>

      {/* 如何获得积分 */}
      <div className={styles.overviewCard}>
        <p className={styles.tasksTitle}>如何获得积分</p>
        <div className={styles.howToGrid}>
          <div className={styles.howToItem}>
            <span className={styles.howToIcon}>🔥</span>
            <span className={styles.howToLabel}>打卡</span>
            <span className={styles.howToValue}>⌊n<sup>3/4</sup>⌋</span>
            <span className={styles.howToCap}>每日 1 次</span>
          </div>
          <div className={styles.howToItem}>
            <span className={styles.howToIcon}>💬</span>
            <span className={styles.howToLabel}>评论</span>
            <span className={styles.howToValue}>+2 分</span>
            <span className={styles.howToCap}>每日 3 次 · ≥5 字</span>
          </div>
          <div className={styles.howToItem}>
            <span className={styles.howToIcon}>📝</span>
            <span className={styles.howToLabel}>发帖</span>
            <span className={styles.howToValue}>+5 分</span>
            <span className={styles.howToCap}>每日 1 次 · ≥10 字</span>
          </div>
          <div className={styles.howToItem}>
            <span className={styles.howToIcon}>📰</span>
            <span className={styles.howToLabel}>文章</span>
            <span className={styles.howToValue}>+10~50</span>
            <span className={styles.howToCap}>发文章后私信 Irade-tqy 审核</span>
          </div>
          <div className={styles.howToItem}>
            <span className={styles.howToIcon}>⭐</span>
            <span className={styles.howToLabel}>许愿</span>
            <span className={styles.howToValue}>+10~200</span>
            <span className={styles.howToCap}>完成时获得</span>
          </div>
        </div>
      </div>

      {/* 积分记录 */}
      <div className={styles.historySection}>
        <h3 className={styles.historyTitle}>📋 积分记录</h3>

        {error && <p className={styles.statusError}>❌ {error}</p>}

        {history.length === 0 && !loading && !error && (
          <p className={styles.status}>暂无积分记录</p>
        )}

        {history.length > 0 && (
          <div className={styles.historyList}>
            {history.map((item) => (
              <div key={item.id} className={styles.historyItem}>
                <div className={styles.historyLeft}>
                  <span className={styles.historyReason}>
                    {POINTS_REASON_LABEL[item.reason] ?? item.reason}
                  </span>
                  <span className={styles.historyDate}>{formatDate(item.created_at)}</span>
                </div>
                <span className={`${styles.historyAmount} ${item.amount > 0 ? styles.amountPositive : ''}`}>
                  {item.amount > 0 ? '+' : ''}{item.amount}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              type="button"
              onClick={loadMore}
              disabled={loading}
            >
              {loading ? '加载中…' : '加载更多'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
