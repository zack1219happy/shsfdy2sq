'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { fetchNotifications, markNotificationRead, clearAllNotifications, deleteNotifications } from '@/lib/gist-api'
import { registry } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import type { Notification } from '@/lib/gist-api'
import styles from '@/styles/auth.module.css'

export default function NoticePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const typeFilter = searchParams.get('type')
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 加载完成时生成一次缓存戳（用于跳转 URL 破缓存），避免在渲染期间调用 Date.now()
  const [cacheBust, setCacheBust] = useState(0)
  const loadedRef = useRef(false)

  const typeTitle = typeFilter
    ? ({
        comment_reply: '评论回复',
        page_owner: '页面动态',
        forum_reply: '论坛回复',
        forum_own_post: '帖子动态',
        forum_post_update: '关注更新',
        forum_like: '赞',
        plaza_like: '赞',
        plaza_tip: '投币',
        wish_reply: '工单回复',
        wish_status_update: '工单动态',
        user_message: '主页留言',
      } as Record<string, string>)[typeFilter] ?? '通知'
    : '通知'

  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    if (loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    fetchNotifications()
      .then((data) => {
        setNotifs(data)
        setCacheBust(Date.now())
      })
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
            const basePath = BASE_PATH
            const page = n.page ? (registry.oldToNewSlug[n.page] ?? n.page) : undefined
            const pageKey = page ?? ''
            // 通知指向的内容类型由 page 前缀决定 —— forum_reply / forum_own_post 既可能指向论坛帖子，也可能指向 plaza 文章
            const isUser = pageKey.startsWith('user/')
            const isForum = pageKey.startsWith('forum/')
            const isPlaza = pageKey.startsWith('plaza/')
            const isWish = pageKey.startsWith('wishes/')
            // wiki 审核通知的 page 带 'wiki/' 前缀，跳转前去掉
            const wikiSlug = pageKey.startsWith('wiki/') ? pageKey.slice('wiki/'.length) : pageKey
            const href = isUser
              ? `${basePath}/user/mypage?user=${encodeURIComponent(pageKey.replace('user/', '') || '')}${n.comment_id ? '&comment=' + n.comment_id : ''}&_=${cacheBust}`
              : isForum
                ? `${basePath}/forum/post?id=${pageKey.replace('forum/', '') || ''}${n.comment_id ? '&comment=' + n.comment_id : ''}&_=${cacheBust}`
                : isPlaza
                  ? `${basePath}/plaza/post?slug=${encodeURIComponent(pageKey.replace('plaza/', '') || '')}${n.comment_id ? '&comment=' + n.comment_id : ''}&_=${cacheBust}`
                  : isWish
                    ? `${basePath}/wishes/post?id=${pageKey.replace('wishes/', '') || ''}${n.comment_id ? '&comment=' + n.comment_id : ''}&_=${cacheBust}`
                    : wikiSlug
                      ? `${basePath}/wiki/page?slug=${wikiSlug}${n.comment_id ? '&comment=' + n.comment_id : ''}&_=${cacheBust}`
                      : undefined

            let label = '评论'
            if (isForum) {
              if (n.type === 'forum_like') label = '赞'
              else if (n.type === 'forum_reply') label = '论坛回复'
              else if (n.type === 'forum_own_post') label = '帖子动态'
              else if (n.type === 'forum_post_update') label = '关注更新'
            } else if (isPlaza) {
              if (n.type === 'plaza_like') label = '赞'
              else if (n.type === 'plaza_tip') label = '投币'
              else if (n.type === 'forum_reply') label = '文章回复'
              else if (n.type === 'forum_own_post') label = '文章动态'
              else label = '文章通知'
            } else if (isWish) {
              if (n.type === 'wish_reply') label = '工单回复'
              else if (n.type === 'wish_status_update') label = '工单动态'
            } else if (isUser) {
              label = '主页留言'
            }

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
                  {n.from_username ? <UserName username={n.from_username} userId={n.from_user_id ?? undefined} /> : '匿名'}
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
