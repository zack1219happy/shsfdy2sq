'use client'

import { forwardRef, useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { getSession } from '@/lib/auth'
import { deleteComment } from '@/lib/gist-api'
import { useCommentAnchor } from '@/hooks/useCommentAnchor'
import type { ForumComment } from '@/types/gist'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/* ==============================================================
   通用评论组件 — 供讨论区、文章广场等复用
   ============================================================== */

export interface CommentItem {
  id: string
  parent_id: string | null
  author_id: string
  author_username: string
  author_color: string | null
  content: string
  created_at: string
  deleted: boolean
}

interface Props {
  comments: CommentItem[]
  onSubmit: (content: string, parentId?: string) => Promise<void>
  onDelete?: (commentId: string) => Promise<void>
  placeholder?: string
  targetCommentId?: string | null
  scrollKey?: number
}

export default function ForumCommentSection({ comments, onSubmit, onDelete, placeholder, targetCommentId, scrollKey }: Props) {
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null)
  const session = getSession()

  // 返回 ref 回调：元素进入 DOM 的精确时刻触发滚动 + 高亮
  const anchorRef = useCommentAnchor(styles.highlight, scrollKey ?? 0)

  const canDelete = useCallback((commentUserId?: string) => {
    if (!session) return false
    if (session.role === 'super_admin') return true
    if (session.role === 'admin' && commentUserId !== session.userId) return true
    if (commentUserId && commentUserId === session.userId) return true
    return false
  }, [session])

  const handleDelete = useCallback(async (commentId: string) => {
    if (!onDelete) return
    try {
      await onDelete(commentId)
    } catch (e: any) {
      alert(e?.message || '删除失败')
    }
  }, [onDelete])

  const handleReply = useCallback((id: string, author: string) => {
    setReplyTarget((prev) => (prev?.id === id ? null : { id, author }))
  }, [])

  // 构建评论树：顶层 + 平铺回复（微信风格，所有回复拍平在 2 层）
  // 对于每一条顶层评论，递归收集其所有子孙回复
  const commentTree = useMemo(() => {
    const topLevel = comments.filter((c) => !c.parent_id)

    // 建索引
    const childrenMap = new Map<string, CommentItem[]>()
    for (const c of comments) {
      if (c.parent_id) {
        if (!childrenMap.has(c.parent_id)) childrenMap.set(c.parent_id, [])
        childrenMap.get(c.parent_id)!.push(c)
      }
    }

    // 递归收集所有子孙回复（拍平）
    function collectDescendants(id: string): CommentItem[] {
      const direct = childrenMap.get(id) ?? []
      const result: CommentItem[] = []
      for (const child of direct) {
        result.push(child)
        result.push(...collectDescendants(child.id))
      }
      return result
    }

    // 对每个顶层评论，收集它的所有回复（拍平）
    const map = new Map<string, CommentItem[]>()
    for (const top of topLevel) {
      const all = collectDescendants(top.id)
      // 按时间正序排列
      all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      map.set(top.id, all)
    }

    // 顶层按时间倒序（最新在上）
    topLevel.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return { topLevel, flatReplies: map }
  }, [comments])

  const treeTopLevel = commentTree.topLevel

  return (
    <div className={styles.commentSection}>
      {session ? (
        <CommentForm
          onSubmit={onSubmit}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          placeholder={placeholder}
        />
      ) : (
        <p style={{ textAlign: 'center', padding: '16px', color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
          请先登录后发表评论
        </p>
      )}

      {treeTopLevel.length === 0 && (
        <p className={styles.empty}>暂无评论，来写第一条吧 ✏️</p>
      )}

      <div className={styles.commentList}>
        {treeTopLevel.map((top) => {
          const replies = commentTree.flatReplies.get(top.id) ?? []
          return (
            <div key={top.id} className={styles.commentTopGroup}>
              <CommentCard
                ref={top.id === targetCommentId ? anchorRef : undefined}
                comment={top}
                onReply={handleReply}
                canDelete={canDelete(top.author_id)}
                onDelete={handleDelete}
              />
              {replies.length > 0 && (
                <div className={styles.commentReplies}>
                  {replies.map((r) => {
                    const parent = comments.find((c) => c.id === r.parent_id)
                    return (
                      <ReplyCard
                        key={r.id}
                        ref={r.id === targetCommentId ? anchorRef : undefined}
                        comment={r}
                        parentAuthor={parent?.author_username}
                        parentColor={parent?.author_color}
                        onReply={handleReply}
                        canDelete={canDelete(r.author_id)}
                        onDelete={handleDelete}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ==============================================================
   CommentForm — 评论输入框
   ============================================================== */

function CommentForm({
  onSubmit,
  replyTarget,
  onClearReply,
  placeholder,
}: {
  onSubmit: (content: string, parentId?: string) => Promise<void>
  replyTarget: { id: string; author: string } | null
  onClearReply: () => void
  placeholder?: string
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(content.trim(), replyTarget?.id)
      setContent('')
    } catch (e: any) {
      alert(e?.message || '评论失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.commentForm}>
      {replyTarget && (
        <div className={styles.replyTag}>
          <span>回复 <strong>{replyTarget.author}</strong></span>
          <button type="button" className={styles.replyTagClose} onClick={onClearReply} title="取消回复">✕</button>
        </div>
      )}

      <div className={styles.commentEditor}>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          config={{ preview: false, fullScreen: false, scrollSync: false }}
          className={styles.commentEditorInner}
        />
      </div>

      <div className={styles.commentSubmitRow}>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
        >
          {submitting ? '提交中…' : replyTarget ? '回复' : (placeholder || '发表评论')}
        </button>
      </div>
    </div>
  )
}

/* ==============================================================
   CommentCard — 顶层评论
   ============================================================== */

const CommentCard = forwardRef<HTMLDivElement, {
  comment: CommentItem
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function CommentCard({ comment, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${styles.commentCard} ${styles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={styles.commentMeta}>
          <span className={`${styles.commentAuthor} ${getAuthorColor(comment.author_color, comment.author_username)}`}>
            {comment.author_username}
          </span>
          <span style={{ fontStyle: 'italic', color: 'var(--color-text-light)', fontSize: '0.82rem' }}>
            该评论已被删除
          </span>
          <span className={styles.commentDate}>{formatDate(comment.created_at)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={styles.commentCard} id={`comment-${comment.id}`}>
      <div className={styles.commentMeta}>
        <span className={`${styles.commentAuthor} ${getAuthorColor(comment.author_color, comment.author_username)}`}>
          {comment.author_username}
        </span>
        {canDelete && (
          <button className={styles.deleteBtn} onClick={() => onDelete(comment.id)} title="删除">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.commentDate}>{formatDate(comment.created_at)}</span>
      </div>
      <div
        className={styles.commentBody}
        onClick={() => onReply(comment.id, comment.author_username)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author_username) }}
      >
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
})

/* ==============================================================
   ReplyCard — 回复评论
   ============================================================== */

const ReplyCard = forwardRef<HTMLDivElement, {
  comment: CommentItem
  parentAuthor?: string
  parentColor?: string | null
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function ReplyCard({ comment, parentAuthor, parentColor, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${styles.unifiedReply} ${styles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={styles.replyMeta}>
          <span className={`${styles.replyAuthor} ${getAuthorColor(comment.author_color, comment.author_username)}`}>
            {comment.author_username}
          </span>
          <span className={styles.replyVerb}> 回复 </span>
          <span className={`${styles.replyTarget} ${getAuthorColor(parentColor)}`}>
            {parentAuthor ?? '未知'}
          </span>
          <span style={{ fontStyle: 'italic', color: 'var(--color-text-light)', fontSize: '0.82rem' }}>
            该评论已被删除
          </span>
          <span className={styles.replyDate}>{formatDate(comment.created_at)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={styles.unifiedReply} id={`comment-${comment.id}`}>
      <div className={styles.replyMeta}>
        <span className={`${styles.replyAuthor} ${getAuthorColor(comment.author_color, comment.author_username)}`}>
          {comment.author_username}
        </span>
        <span className={styles.replyVerb}> 回复 </span>
        <span className={`${styles.replyTarget} ${getAuthorColor(parentColor)}`}>
          {parentAuthor ?? '未知'}
        </span>
        {canDelete && (
          <button className={styles.deleteBtn} onClick={() => onDelete(comment.id)} title="删除">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.replyDate}>{formatDate(comment.created_at)}</span>
      </div>
      <div
        className={styles.replyContent}
        onClick={() => onReply(comment.id, comment.author_username)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author_username) }}
      >
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
})

/* ==============================================================
   工具函数
   ============================================================== */

function getAuthorColor(color?: string | null, username?: string): string {
  switch (username) {
    case 'tqy': return styles.colorTqy
    case 'zyj': return styles.colorZyj
    case 'DouDou': return styles.colorDouDou
  }
  switch (color) {
    case 'rainbow': return styles.colorWz
    case '#1a73e8': return styles.colorTqy
    case '#dc2626': return styles.colorZyj
    case '#16a34a': return styles.colorDouDou
    default: return ''
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return diffMin + ' 分钟前'

    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return diffHour + ' 小时前'

    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 7) return diffDay + ' 天前'

    return d.toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}
