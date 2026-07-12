'use client'

import { forwardRef, useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { getSession, canDeleteComment } from '@/lib/auth'
import { deleteComment } from '@/lib/gist-api'
import { useCommentAnchor } from '@/hooks/useCommentAnchor'
import { UserName } from '@/components/UserName'
import { formatDate } from '@/lib/forum'
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

  const canDelete = useCallback(
    (commentUserId?: string) => canDeleteComment(session, commentUserId),
    [session],
  )

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
          <UserName username={comment.author_username} className={styles.commentAuthor} />
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
      <div
        className={styles.commentMeta}
        role="button"
        tabIndex={0}
        onClick={() => onReply(comment.id, comment.author_username)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author_username) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author_username} className={styles.commentAuthor} />
        {canDelete && (
          <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }} title="删除">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.commentDate}>{formatDate(comment.created_at)}</span>
      </div>
      <div className={styles.commentBody}>
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
          <UserName username={comment.author_username} className={styles.replyAuthor} />
          <span className={styles.replyVerb}> 回复 </span>
          {parentAuthor ? <UserName username={parentAuthor} className={styles.replyTarget} /> : <span className={styles.replyTarget}>未知</span>}
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
      <div
        className={styles.replyMeta}
        role="button"
        tabIndex={0}
        onClick={() => onReply(comment.id, comment.author_username)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author_username) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author_username} className={styles.replyAuthor} />
        <span className={styles.replyVerb}> 回复 </span>
        {parentAuthor ? <UserName username={parentAuthor} className={styles.replyTarget} /> : <span className={styles.replyTarget}>未知</span>}
        {canDelete && (
          <button className={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }} title="删除">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.replyDate}>{formatDate(comment.created_at)}</span>
      </div>
      <div className={styles.replyContent}>
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
})
