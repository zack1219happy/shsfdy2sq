'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { clearAllNotifications, deleteNotifications, fetchNotifications, markNotificationRead } from '@/lib/api/notifications'
import { registry } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { formatNotificationSummary, getNotificationTarget } from '@/lib/notification-text'
import FaIcon from '@/components/FaIcon'
import type { Notification } from '@/lib/api/notifications'
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
        mention: '提到你',
        mention_edit: '提到你',
        emoji_pack_deleted: '表情包',
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

  const handleNotificationClick = useCallback(async (
    event: MouseEvent<HTMLAnchorElement>,
    notification: Notification,
    href: string | undefined,
  ) => {
    if (!href) return
    event.preventDefault()
    try {
      await handleRead(notification.id)
    } catch {
      // 页面仍然应该可以打开；详情页加载时还会再次按目标内容标记已读。
    }
    window.location.assign(href)
  }, [handleRead])

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
            // 兼容旧通知中的 forum/post?id=...、plaza/post?slug=... 格式。
            const target = getNotificationTarget(pageKey)
            const isUser = target?.kind === 'user'
            const isForum = target?.kind === 'forum'
            const isPlaza = target?.kind === 'plaza'
            const isWish = target?.kind === 'wish'
            const isAgreement = target?.kind === 'agreement'
            const isDm = target?.kind === 'dm'
            const isEmoji = target?.kind === 'emoji'
            // wiki 审核通知的 page 带 'wiki/' 前缀，跳转前去掉
            const wikiSlug = target?.kind === 'wiki' ? target.key : pageKey
            const commentQuery = n.comment_id ? '&comment=' + encodeURIComponent(n.comment_id) : ''
            const cacheQuery = `&_=${cacheBust}`
            const href = isEmoji
              ? `${basePath}/user/emoji${cacheQuery}`
              : isDm && target
                ? `${basePath}/dm?conv=${encodeURIComponent(target.key)}${cacheQuery}`
                : isAgreement && target
                  ? `${basePath}/agreement/${encodeURIComponent(target.key)}${cacheQuery}`
                  : isUser && target
                    ? `${basePath}/user/mypage?user=${encodeURIComponent(target.key)}${commentQuery}${cacheQuery}`
              : isForum && target
                ? `${basePath}/forum/post?id=${encodeURIComponent(target.key)}${commentQuery}${cacheQuery}`
                : isPlaza && target
                  ? `${basePath}/plaza/post?slug=${encodeURIComponent(target.key)}${commentQuery}${cacheQuery}`
                  : isWish && target
                    ? `${basePath}/wishes/post?id=${encodeURIComponent(target.key)}${commentQuery}${cacheQuery}`
                    : wikiSlug
                      ? `${basePath}/wiki/page?slug=${encodeURIComponent(wikiSlug)}${commentQuery}${cacheQuery}`
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
            } else if (isAgreement) {
              label = '公告'
            } else if (isDm) {
              label = '私信'
            } else if (isEmoji) {
              label = '表情包'
            } else if (isUser) {
              label = '主页留言'
            }
            // 提及标签统一覆盖，避免落到「文章通知」这类兜底文案
            if (n.type === 'mention') label = '提到你'
            else if (n.type === 'mention_edit') label = '编辑后提到你'

            const isDeleted = n.excerpt === '评论已删除'

            return (
              <a
                key={n.id}
                className={`${styles.notifItem} ${n.read ? styles.notifRead : ''} ${isDeleted ? styles.notifDeleted : ''}`}
                href={isDeleted ? undefined : href}
                onClick={(event) => handleNotificationClick(event, n, isDeleted ? undefined : href)}
                style={isDeleted ? { pointerEvents: 'none' } : undefined}
              >
                <span className={styles.notifFrom}>
                  <span className={styles.notifType}>{label}</span>
                </span>
                <span className={styles.notifText}>{formatNotificationSummary(n)}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
