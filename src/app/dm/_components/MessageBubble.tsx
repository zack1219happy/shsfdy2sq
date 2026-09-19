'use client'

import { useCallback, useMemo, useRef } from 'react'
import { UserName } from '@/components/UserName'
import { useMentionHydration } from '@/components/MentionHydrator'
import type { DmMessage } from '@/lib/api/dm'
import { renderMarkdownWithRegistry, replaceWikiLinks } from '@/lib/markdown'
import { useContentContextVersion, useEmojiLibrary } from '@/lib/emoji/use-emoji-context'
import { registry, titleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import styles from '@/styles/dm.module.css'

/** 消息时间：今天显示 HH:MM，否则 M/D HH:MM */
function formatMsgTime(dateStr: string): string {
    const d = new Date(dateStr)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (isToday) return time
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

/** 单条私信气泡（含右键菜单入口与发送失败标记） */
export default function MessageBubble({ msg, failed, onContextMenu }: {
    msg: DmMessage
    failed: boolean
    onContextMenu?: (e: React.MouseEvent, msg: DmMessage) => void
}) {
    const contentRef = useRef<HTMLDivElement | null>(null)
    // 私信有作者身份 → 表情按发送者的库解析
    useEmojiLibrary(msg.sender_id)
    const ctxVersion = useContentContextVersion()
    // ctxVersion 参与计算：表情库 / 用户名白名单就绪后重新渲染
    const html = useMemo(
        () => {
            void ctxVersion
            return replaceWikiLinks(
                renderMarkdownWithRegistry(msg.content, registry, { emojiContextUserId: msg.sender_id }),
                titleSlugMap, BASE_PATH,
            ).replace(/\n+$/, '')
        },
        [msg.content, msg.sender_id, ctxVersion],
    )
    const mentionPortals = useMentionHydration(contentRef, html)

    const handleContext = useCallback(
        (e: React.MouseEvent) => onContextMenu?.(e, msg),
        [onContextMenu, msg],
    )

    return (
        <div
            className={`${styles.message} ${msg.is_mine ? styles.messageMine : styles.messageOther}`}
            onContextMenu={handleContext}
        >
            <span className={styles.messageAuthor}>
                <UserName username={msg.sender_username} userId={msg.sender_id} />
            </span>
            <div
                className={`${styles.bubble} ${msg.is_mine ? styles.bubbleMine : styles.bubbleOther} ${msg.recalled_at ? styles.bubbleRecalled : ''} ${failed ? styles.bubbleFailed : ''}`}
            >
                {msg.recalled_at ? (
                    <span className={styles.recalledText}>消息已撤回</span>
                ) : (
                    <div ref={contentRef} className={styles.bubbleContent} dangerouslySetInnerHTML={{ __html: html }} />
                )}
            </div>
            <span className={styles.messageTime}>
                {formatMsgTime(msg.created_at)}
                {msg.is_mine && msg.recalled_at && ' (已撤回)'}
            {failed && ' · 发送失败'}
            </span>
            {mentionPortals}
        </div>
    )
}
