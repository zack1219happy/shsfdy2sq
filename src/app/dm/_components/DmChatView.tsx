'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UserName } from '@/components/UserName'
import { DmMessage, getConversations, getMessages, markConversationRead, recallMessage, sendMessage } from '@/lib/api/dm'
import { getSession } from '@/lib/auth'
import { useCodeCopy } from '@/lib/useCodeCopy'
import MessageBubble from './MessageBubble'
import { useEmojiContextMenu } from '@/lib/emoji/use-emoji-context-menu'
import DmComposer from './DmComposer'
import { useDmChannel } from './useDmChannel'
import styles from '@/styles/dm.module.css'

const RECALL_WINDOW_MS = 2 * 60 * 1000
const RECALLED_TEXT = '【消息已撤回】'

/** 现有对话视图（?conv=xxx）：加载 + 实时 + 心跳 + 乐观发送 + 撤回 */
export default function DmChatView({
    conversationId,
    currentUserId,
}: {
    conversationId: string
    currentUserId: string
}) {
    const [messages, setMessages] = useState<DmMessage[]>([])
    const [loading, setLoading] = useState(true)
    const [input, setInput] = useState('')
    const [otherUser, setOtherUser] = useState<{ id: string; username: string; name: string } | null>(null)
    const otherUserNameRef = useRef('')
    const [contextMenu, setContextMenu] = useState<{
        x: number
        y: number
        messageId: string
        canRecall: boolean
    } | null>(null)
    const [failedIds, setFailedIds] = useState<string[]>([])
    const [sendError, setSendError] = useState<string | null>(null)
    const [editorKey, setEditorKey] = useState(0)
    const listRef = useRef<HTMLDivElement | null>(null)
    // 右键表情：加入我的表情 / 添加整包 / 管理员解禁
    const emojiMenu = useEmojiContextMenu(listRef)
    const sendingRef = useRef(false)

    // 加载消息与会话信息
    useEffect(() => {
        if (!conversationId) return

        let active = true
        otherUserNameRef.current = ''

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
        return () => {
            active = false
        }
    }, [conversationId])

    // 实时通道 + 已读 + 心跳
    const handleInsert = useCallback((msg: { id: string; sender_id: string; content: string; created_at: string; recalled_at: string | null }) => {
        if (msg.sender_id === currentUserId) return
        setMessages((prev) => [
            ...prev,
            {
                id: msg.id,
                sender_id: msg.sender_id,
                sender_username: otherUserNameRef.current || '',
                content: msg.recalled_at ? RECALLED_TEXT : msg.content,
                created_at: msg.created_at,
                recalled_at: msg.recalled_at,
                is_mine: false,
            },
        ])
        window.dispatchEvent(new CustomEvent('dm-new-message'))
        markConversationRead(conversationId).catch(() => {})
    }, [currentUserId, conversationId])

    const handleUpdate = useCallback((msg: { id: string; recalled_at: string | null }) => {
        // 消息被撤回 → 更新气泡内容
        if (msg.recalled_at) {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === msg.id
                        ? { ...m, recalled_at: msg.recalled_at, content: RECALLED_TEXT }
                        : m,
                ),
            )
            window.dispatchEvent(new CustomEvent('dm-new-message'))
        }
    }, [])

    useDmChannel(conversationId, currentUserId, { onInsert: handleInsert, onUpdate: handleUpdate })

    // 代码块复制按钮
    useCodeCopy(listRef)

    // 新消息自动滚到底部
    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
        }
    }, [messages])

    // 发送（乐观）
    const handleSend = useCallback(async () => {
        if (!input.trim() || !otherUser || sendingRef.current) return
        sendingRef.current = true

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const text = input.trim()
        const username = getSession()?.username || ''

        // 乐观显示消息，不等待后端
        setMessages((prev) => [
            ...prev,
            {
                id: tempId,
                sender_id: currentUserId,
                sender_username: username,
                content: text,
                created_at: new Date().toISOString(),
                recalled_at: null,
                is_mine: true,
            },
        ])
        setInput('')
        setEditorKey((k) => k + 1)
        setSendError(null)
        window.dispatchEvent(new CustomEvent('dm-new-message'))
        window.dispatchEvent(new CustomEvent('new-dm'))

        try {
            const realId = await sendMessage(otherUser.id, text)
            // 替换临时 ID 为真实 ID
            setMessages((prev) =>
                prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m)),
            )
            // 清理 failedIds 中的残留 tempId（如果之前失败过但这次成功）
            setFailedIds((prev) => prev.filter(id => id !== tempId))
            // 成功后补发事件，确保侧栏读到最新数据
            window.dispatchEvent(new CustomEvent('dm-new-message'))
            window.dispatchEvent(new CustomEvent('new-dm'))
        } catch (e: unknown) {
            setFailedIds((prev) => [...prev, tempId])
            setSendError((e as { message?: string } | null)?.message || '发送失败')
        } finally {
            sendingRef.current = false
        }
    }, [input, otherUser, currentUserId])

    // 撤回
    const handleRecall = useCallback(async (messageId: string) => {
        try {
            await recallMessage(messageId)
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === messageId ? { ...m, recalled_at: new Date().toISOString(), content: RECALLED_TEXT } : m,
                ),
            )
            window.dispatchEvent(new CustomEvent('dm-new-message'))
        } catch (e: unknown) {
            alert((e as { message?: string } | null)?.message || '撤回失败')
        }
        setContextMenu(null)
    }, [])

    // 右键菜单
    const handleContextMenu = useCallback(
        (e: React.MouseEvent, msg: DmMessage) => {
            e.preventDefault()
            if (!msg.is_mine) return
            if (failedIds.includes(msg.id)) return
            const created = new Date(msg.created_at).getTime()
            const canRecall = Date.now() - created < RECALL_WINDOW_MS && !msg.recalled_at
            setContextMenu({ x: e.clientX, y: e.clientY, messageId: msg.id, canRecall })
        },
        [failedIds],
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
                    {otherUser ? <UserName username={otherUser.username} userId={otherUser.id} /> : '加载中…'}
                </span>
            </div>

            {/* 消息列表 */}
            <div ref={listRef} className={styles.messageList}>
                {loading ? (
                    <p className={styles.status}>加载中…</p>
                ) : (
                    <>
                        {messages.length === 0 ? (
                            <p className={styles.status}>开始聊天吧 👋</p>
                        ) : (
                            messages.map((msg) => (
                                <MessageBubble
                                    key={msg.id}
                                    msg={msg}
                                    failed={failedIds.includes(msg.id)}
                                    onContextMenu={handleContextMenu}
                                />
                            ))
                        )}
                        {sendError && (
                            <div className={styles.sendError}>{sendError}</div>
                        )}
                    </>
                )}
            </div>

            {/* 输入区 */}
            <DmComposer value={input} onChange={setInput} onSubmit={handleSend} resetKey={editorKey} />
            {emojiMenu}

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
