'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import {
  getConversations,
  getUnreadDmCount,
  fetchAllUsers,
  type Conversation,
} from '@/lib/gist-api'
import type { UserInfo } from '@/types/gist'
import { getPinyinInitials } from '@/lib/people'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import styles from '@/styles/dm-filepad.module.css'

export default function DmFilePad() {
  const router = useRouter()
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setActiveConvId(params.get('conv'))
  }, [])

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 加载对话列表
  const load = useCallback(async () => {
    if (!getSession()) return
    try {
      const [convs, users] = await Promise.all([
        getConversations(),
        fetchAllUsers(),
      ])
      setConversations(convs)
      setAllUsers(users)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 15000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  // 监听 Realtime 新消息事件
  useEffect(() => {
    const h = () => {
      load()
      getUnreadDmCount().then(() => {}).catch(() => {})
      window.dispatchEvent(new CustomEvent('new-dm'))
    }
    window.addEventListener('dm-new-message', h)
    return () => window.removeEventListener('dm-new-message', h)
  }, [load])

  const session = getSession()
  const existingUserIds = useMemo(
    () => new Set(conversations.map((c) => c.other_user_id)),
    [conversations],
  )

  // 过滤对话
  const filteredConvs = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(
      (c) =>
        c.other_name.toLowerCase().includes(q) ||
        c.other_username.toLowerCase().includes(q) ||
        getPinyinInitials(c.other_name).toLowerCase().includes(q),
    )
  }, [conversations, search])

  // 过滤用户（新建对话用）
  const filteredUsers = useMemo(() => {
    if (!search.trim() || !showNew) return []
    const q = search.toLowerCase()
    return allUsers.filter(
      (u) =>
        u.id !== session?.userId &&
        (u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          getPinyinInitials(u.name).toLowerCase().includes(q)),
    )
  }, [allUsers, search, showNew, session?.userId])

  const showUserResults = showNew && search.trim().length > 0

  return (
    <div className={styles.container}>
      {/* 标题 */}
      <div className={styles.header}>
        <FaIcon name="envelope" />
        <span>私信</span>
        <button
          className={`${styles.newBtn} ${showNew ? styles.newBtnActive : ''}`}
          onClick={() => {
            setShowNew(!showNew)
            if (!showNew) setSearch('')
          }}
          title="新建私信"
        >
          ＋
        </button>
      </div>

      {/* 搜索框 */}
      <div className={styles.searchWrap}>
        <FaIcon name="search" className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          type="text"
          placeholder={showNew ? '搜索用户…' : '搜索姓名或用户名…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus={showNew}
        />
        {search && (
          <button className={styles.searchClear} onClick={() => setSearch('')}>
            ✕
          </button>
        )}
      </div>

      {/* 对话列表 / 用户搜索结果 */}
      <div className={styles.list}>
        {loading ? (
          <p className={styles.status}>加载中…</p>
        ) : showUserResults ? (
          <>
            {filteredUsers.length === 0 ? (
              <p className={styles.status}>无匹配用户</p>
            ) : (
              <div className={styles.userList}>
                {filteredUsers.map((u) => {
                  const existingConv = conversations.find(
                    (c) => c.other_user_id === u.id,
                  )
                  return (
                    <button
                      key={u.id}
                      className={styles.userItem}
                      onClick={() => {
                        if (existingConv) {
                          router.push(`/dm?conv=${existingConv.conversation_id}`)
                        } else {
                          // 导航到 DM 页，让 send_message 自动创建对话
                          router.push(`/dm?user=${u.id}`)
                        }
                        setShowNew(false)
                        setSearch('')
                      }}
                    >
                      <span className={styles.userItemName}>
                        <UserName username={u.username} />
                        {existingConv && (
                          <span className={styles.userItemHint}>已有对话</span>
                        )}
                      </span>
                      <span className={styles.userItemUsername}>
                        @<UserName username={u.username} />
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        ) : showNew && !search.trim() ? (
          <p className={styles.status}>在上方搜索框输入姓名或用户名</p>
        ) : filteredConvs.length === 0 ? (
          <p className={styles.status}>
            {search.trim() ? '无匹配对话' : '暂无对话，点击 ＋ 发起新私信'}
          </p>
        ) : (
          filteredConvs.map((conv) => {
            const isActive = conv.conversation_id === activeConvId
            return (
              <button
                key={conv.conversation_id}
                className={`${styles.item} ${isActive ? styles.itemActive : ''} ${conv.unread_count > 0 ? styles.itemUnread : ''}`}
                onClick={() => router.push(`/dm?conv=${conv.conversation_id}`)}
              >
                <div className={styles.itemTop}>
                  <span className={styles.itemName}>
                    <UserName username={conv.other_username} />
                    {conv.unread_count > 0 && (
                      <span className={styles.unreadBadge}>
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    )}
                  </span>
                  <span className={styles.itemTime}>
                    {formatTime(conv.last_message_at)}
                  </span>
                </div>
                <span className={styles.itemPreview}>
                  {conv.last_message || ''}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  if (diffHour < 24) return `${diffHour}小时前`
  if (diffDay < 7) return `${diffDay}天前`

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
