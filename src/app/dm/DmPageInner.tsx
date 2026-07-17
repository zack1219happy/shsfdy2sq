'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  getConversations,
  getMessages,
  sendMessage,
  recallMessage,
  markConversationRead,
  heartbeatConversation,
  leaveConversation,
  fetchAllUsers,
  type DmMessage,
  type Conversation,
} from '@/lib/gist-api'
import type { UserInfo } from '@/types/gist'
import { renderClientWithRegistry, replaceWikiLinks } from '@/lib/render-client'
import { registry, titleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { useCodeCopy } from '@/lib/useCodeCopy'
import { UserName } from '@/components/UserName'
import styles from '@/styles/dm.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function DmPageInner() {
  const [activeQuery, setActiveQuery] = useState(() => window.location.search)
  const router = useRouter()
  const session = getSession()

  // 同步 URL query — 同时处理浏览器前进/后退 (popstate) 和
  // 从 layout 侧栏发起的导航 (dm-route-change 自定义事件)
  useEffect(() => {
    const syncQuery = () => setActiveQuery(window.location.search)
    syncQuery()
    window.addEventListener('popstate', syncQuery)
    window.addEventListener('dm-route-change', syncQuery)
    return () => {
      window.removeEventListener('popstate', syncQuery)
      window.removeEventListener('dm-route-change', syncQuery)
    }
  }, [])

  const params = useMemo(() => new URLSearchParams(activeQuery), [activeQuery])
  const convId = params.get('conv')
  const userId = params.get('user')

  if (!session) {
    return null
  }

  useEffect(() => {
    if (!session) router.push('/')
  }, [session, router])

  return (
    <div className={styles.page}>
      {convId ? (
        <DmChatView key={convId} conversationId={convId} currentUserId={session.userId} />
      ) : userId ? (
        <NewChatView key={userId} otherUserId={userId} currentUserId={session.userId} />
      ) : (
        <DmEmptyState />
      )}
    </div>
  )
}

/* ==============================================================
   DmEmptyState
   ============================================================== */

function DmEmptyState() {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>💬</div>
      <p className={styles.emptyText}>选择一个对话开始聊天</p>
      <p className={styles.emptyHint}>或点击左侧「＋」发起新私信</p>
    </div>
  )
}

/* ==============================================================
   NewChatView — 新建对话（?user=xxx）
   ============================================================== */

function NewChatView({
  otherUserId,
  currentUserId,
}: {
  otherUserId: string
  currentUserId: string
}) {
  const router = useRouter()
  const [otherUser, setOtherUser] = useState<UserInfo | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetchAllUsers().then((users) => {
      const u = users.find((u) => u.id === otherUserId)
      if (u) setOtherUser(u)
    })
  }, [otherUserId])

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const msgId = await sendMessage(otherUserId, input.trim())
      // 发送成功后获取对话 ID 并跳转
      const convs = await getConversations()
      const conv = convs.find((c) => c.other_user_id === otherUserId)
      if (conv) {
        router.replace(`/dm?conv=${conv.conversation_id}`)
      } else {
        router.replace('/dm')
      }
    } catch (e: any) {
      alert(e?.message || '发送失败')
    } finally {
      setSending(false)
    }
  }, [input, otherUserId, sending, router])

  return (
    <div className={styles.chatView}>
      <div className={styles.chatHeader}>
        <span className={styles.chatHeaderName}>
          {otherUser ? <UserName username={otherUser.username} /> : '加载中…'}
        </span>
      </div>

      <div className={styles.messageList}>
        <p className={styles.status}>发送第一条消息给对方 👋</p>
      </div>

      <div className={styles.inputArea}>
        <div className={styles.editorWrap}>
          <span className={styles.editorHint}>Ctrl+Enter 发送</span>
          <MarkdownEditor
            value={input}
            onChange={setInput}
            config={{ preview: false, fullScreen: false, scrollSync: false }}
            className={styles.editorInner}
            onSubmit={handleSend}
          />
        </div>
        <div className={styles.inputActions}>
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            {sending ? '发送中…' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ==============================================================
   DmChatView — 现有对话（?conv=xxx）
   ============================================================== */

function DmChatView({
  conversationId,
  currentUserId,
}: {
  conversationId: string
  currentUserId: string
}) {
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState('')
  const [otherUser, setOtherUser] = useState<{ id: string; username: string; name: string } | null>(null)
  const otherUserNameRef = useRef('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    messageId: string
    canRecall: boolean
  } | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  // 加载消息
  useEffect(() => {
    if (!conversationId) return

    let active = true
    setLoading(true)
    setMessages([])
    setInput('')
    setOtherUser(null)
    otherUserNameRef.current = ''
    setContextMenu(null)

    const loadConversation = async () => {
      try {
        const [data, convs] = await Promise.all([getMessages(conversationId), getConversations()])
        if (!active) return

        setMessages(data.reverse())

        const conv = convs.find((c) => c.conversation_id === conversationId)
        if (conv) {
          setOtherUser({
            id: conv.other_user_id,
            username: conv.other_username,
            name: conv.other_name,
          })
          otherUserNameRef.current = conv.other_username || ''
        }
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false)
      }
    }

    loadConversation()

    // 标记已读，完成后通知侧边栏刷新未读数
    markConversationRead(conversationId).finally(() => {
      window.dispatchEvent(new CustomEvent('dm-new-message'))
    })

    return () => {
      active = false
    }
  }, [conversationId])

  // Realtime 订阅
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel('dm-' + conversationId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const msg = payload.new
          if (msg.sender_id === currentUserId) return
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              sender_id: msg.sender_id,
              sender_username: otherUserNameRef.current || '',
              content: msg.recalled_at ? '【消息已撤回】' : msg.content,
              created_at: msg.created_at,
              recalled_at: msg.recalled_at,
              is_mine: false,
            },
          ])
          window.dispatchEvent(new CustomEvent('dm-new-message'))
          markConversationRead(conversationId).catch(() => {})
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const msg = payload.new
          // 消息被撤回 → 更新气泡内容
          if (msg.recalled_at) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...m, recalled_at: msg.recalled_at, content: '【消息已撤回】' }
                  : m,
              ),
            )
            window.dispatchEvent(new CustomEvent('dm-new-message'))
          }
        },
      )
      .subscribe((status, err) => {
        console.log('[DM] sub:', status, err?.message)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [conversationId, currentUserId])

  // 代码块复制按钮
  useCodeCopy(listRef)

  // 新消息自动滚到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  // 活跃心跳 — 标记用户在对话页面上，实时接收的消息不计入未读
  useEffect(() => {
    if (!conversationId) return

    heartbeatConversation(conversationId).catch(() => {})

    const interval = setInterval(() => {
      heartbeatConversation(conversationId).catch(() => {})
    }, 10000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        heartbeatConversation(conversationId).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      leaveConversation(conversationId).catch(() => {})
    }
  }, [conversationId])

  // 发送
  const handleSend = useCallback(async () => {
    if (!input.trim() || !otherUser || sending) return
    setSending(true)
    try {
      const msgId = await sendMessage(otherUser.id, input.trim())
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          sender_id: currentUserId,
          sender_username: getSession()?.username || '',
          content: input.trim(),
          created_at: new Date().toISOString(),
          recalled_at: null,
          is_mine: true,
        },
      ])
      setInput('')
      window.dispatchEvent(new CustomEvent('dm-new-message'))
      window.dispatchEvent(new CustomEvent('new-dm'))
    } catch (e: any) {
      alert(e?.message || '发送失败')
    } finally {
      setSending(false)
    }
  }, [input, otherUser, sending, currentUserId])

  // 撤回
  const handleRecall = useCallback(async (messageId: string) => {
    try {
      await recallMessage(messageId)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, recalled_at: new Date().toISOString(), content: '【消息已撤回】' } : m,
        ),
      )
      window.dispatchEvent(new CustomEvent('dm-new-message'))
    } catch (e: any) {
      alert(e?.message || '撤回失败')
    }
    setContextMenu(null)
  }, [])

  // 右键菜单
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, msg: DmMessage) => {
      e.preventDefault()
      if (!msg.is_mine) return
      const created = new Date(msg.created_at).getTime()
      const canRecall = Date.now() - created < 2 * 60 * 1000 && !msg.recalled_at
      setContextMenu({ x: e.clientX, y: e.clientY, messageId: msg.id, canRecall })
    },
    [],
  )

  // 点击外部关闭右键菜单
  useEffect(() => {
    const h = () => setContextMenu(null)
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [])

  return (
    <div className={styles.chatView}>
      {/* 头部 */}
      <div className={styles.chatHeader}>
        <span className={styles.chatHeaderName}>
          {otherUser ? <UserName username={otherUser.username} /> : '加载中…'}
        </span>
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className={styles.messageList}>
        {loading ? (
          <p className={styles.status}>加载中…</p>
        ) : messages.length === 0 ? (
          <p className={styles.status}>开始聊天吧 👋</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.is_mine ? styles.messageMine : styles.messageOther}`}
              onContextMenu={(e) => handleContextMenu(e, msg)}
            >
              <span className={styles.messageAuthor}>
                <UserName username={msg.sender_username} />
              </span>
              <div
                className={`${styles.bubble} ${msg.is_mine ? styles.bubbleMine : styles.bubbleOther} ${msg.recalled_at ? styles.bubbleRecalled : ''}`}
              >
                {msg.recalled_at ? (
                  <span className={styles.recalledText}>消息已撤回</span>
                ) : (
                  <div className={styles.bubbleContent} dangerouslySetInnerHTML={{ __html: replaceWikiLinks(renderClientWithRegistry(msg.content, registry), titleSlugMap, BASE_PATH).replace(/\n+$/, '') }} />
                )}
              </div>
              <span className={styles.messageTime}>
                {formatMsgTime(msg.created_at)}
                {msg.is_mine && msg.recalled_at && ' (已撤回)'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 输入区 */}
      <div className={styles.inputArea}>
        <div className={styles.editorWrap}>
          <span className={styles.editorHint}>Ctrl+Enter 发送</span>
          <MarkdownEditor
            value={input}
            onChange={setInput}
            config={{ preview: false, fullScreen: false, scrollSync: false }}
            className={styles.editorInner}
            onSubmit={handleSend}
          />
        </div>
        <div className={styles.inputActions}>
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || !input.trim()}
          >
            {sending ? '发送中…' : '发送'}
          </button>
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.canRecall ? (
            <button className={styles.contextMenuItem} onClick={() => handleRecall(contextMenu.messageId)}>
              撤回
            </button>
          ) : (
            <button className={`${styles.contextMenuItem} ${styles.contextMenuDisabled}`} disabled>
              超过 2 分钟无法撤回
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   工具函数
   ============================================================== */

function formatMsgTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (isToday) return time
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}
