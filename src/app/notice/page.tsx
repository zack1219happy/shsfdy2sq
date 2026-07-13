'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { fetchNotifications, markNotificationRead, clearAllNotifications, deleteNotifications } from '@/lib/gist-api'
import { registry } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import FaIcon from '@/components/FaIcon'
import type { Notification } from '@/lib/gist-api'
import styles from '@/styles/auth.module.css'

export default function NoticePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeFilter = searchParams.get('type')
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  const typeTitle = typeFilter
    ? ({
        comment_reply: '评论回复',
        page_owner: '页面动态',
        forum_reply: '论坛回复',
        forum_own_post: '帖子动态',
        forum_post_update: '关注更新',
      } as Record<string, string>)[typeFilter] ?? '通知'
    : '通知'

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    fetchNotifications()
      .then((data) => setNotifs(data))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [router])

  const filtered = typeFilter
    ? notifs.filter((n) => n.type === typeFilter)
    : notifs

  const handleRead = useCallback(async (id: string) => {
    await markNotificationRead(id)
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [])

  const handleClearAll = useCallback(async () => {
    await clearAllNotifications(typeFilter ?? undefined)
    setNotifs((prev) =>
      typeFilter
        ? prev.map((n) => n.type === typeFilter ? { ...n, read: true } : n)
        : prev.map((n) => ({ ...n, read: true })),
    )
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [typeFilter])

  const handleDelete = useCallback(async () => {
    await deleteNotifications(typeFilter ?? undefined)
    setNotifs((prev) =>
      typeFilter
        ? prev.filter((n) => n.type !== typeFilter)
        : [],
    )
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [typeFilter])

  return (
    <div className={styles.noticePage}>
      <div className={styles.noticeHeader}>
        <h2><FaIcon name="bell" /> {typeTitle}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.notifClear} onClick={handleClearAll}>全部已读</button>
          <button className={styles.notifClear} onClick={handleDelete}>清空</button>
        </div>
      </div>

      {loading && <p className={styles.noticeStatus}>加载中…</p>}
      {error && <p className={styles.noticeStatusError}>❌ {error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className={styles.noticeStatus}>暂无通知</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className={styles.noticeList}>
          {filtered.map((n) => {
            const isForum = n.type?.startsWith('forum_')
            const basePath = BASE_PATH
            const page = n.page ? (registry.oldToNewSlug[n.page] ?? n.page) : undefined
            const href = isForum
              ? `${basePath}/forum/post?id=${n.page?.replace('forum/', '') || ''}&comment=${n.comment_id}&_=${Date.now()}`
              : page
                  ? `${basePath}/wiki/${page}/?comment=${n.comment_id}&_=${Date.now()}`
                  : undefined

            let label = '评论'
            if (n.type === 'forum_reply') label = '论坛回复'
            else if (n.type === 'forum_own_post') label = '帖子动态'
            else if (n.type === 'forum_post_update') label = '关注更新'

            const isDeleted = n.excerpt === '评论已删除'

            return (
              <a
                key={n.id}
                className={`${styles.notifItem} ${n.read ? styles.notifRead : ''} ${isDeleted ? styles.notifDeleted : ''}`}
                href={isDeleted ? undefined : href}
                onClick={() => handleRead(n.id)}
                style={isDeleted ? { pointerEvents: 'none' } : undefined}
              >
                <span className={styles.notifFrom}>
                  {n.from_username ?? '匿名'}
                  <span className={styles.notifType}>{label}</span>
                </span>
                <span className={styles.notifText}>{n.excerpt ?? ''}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
