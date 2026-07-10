'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPageComments, addComment, deleteComment } from '@/lib/gist-api'
import { getSession } from '@/lib/auth'
import type { Comment } from '@/types/gist'
import WikiContent from '@/components/WikiContent'
import styles from '@/styles/comment.module.css'

interface Props {
  pageSlug: string
}

/* ==============================================================
   CommentSection — 评论区容器
   ============================================================== */
export default function CommentSection({ pageSlug }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setReplyTarget(null)

    fetchPageComments(pageSlug)
      .then((data) => {
        if (cancelled) return
        setComments(data)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setError(e.message ?? '加载评论失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [pageSlug])

  const handleAdd = useCallback(
    async (input: { author: string; content: string; userId?: string }) => {
      await addComment(pageSlug, { ...input, parentId: replyTarget?.id })
      setReplyTarget(null)
      const data = await fetchPageComments(pageSlug)
      setComments(data)
      window.dispatchEvent(new CustomEvent('new-notification'))
    },
    [pageSlug, replyTarget],
  )


  const session = getSession()
  const canDelete = useCallback(
    (commentUserId?: string) => {
      if (!session) return false
      if (session.role === "super_admin") return true
      if (session.role === "admin" && commentUserId !== session.userId) return true
      if (commentUserId && commentUserId === session.userId) return true
      return false
    },
    [session],
  )

  const handleDelete = useCallback(
    async (commentId: string) => {
      if (!session) return
      try {
        await deleteComment(commentId)
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      } catch (e: any) {
        alert(e?.message || '删除失败')
      }
    },
    [session],
  )

  const handleReplyClick = useCallback((id: string, author: string) => {
    setReplyTarget((prev) => (prev?.id === id ? null : { id, author }))
  }, [])

  // ---- 数据整理：顶层评论 + 扁平回复分组 ----

  const commentMap = useMemo(() => {
    const m = new Map<string, Comment>()
    for (const c of comments) m.set(c.id, c)
    return m
  }, [comments])

  interface ReplyGroup {
    comment: Comment
    depth: number
    parentAuthor?: string
    parentColor?: string
  }

  const groups = useMemo(() => {
    const topLevel = comments.filter((c) => !c.parentId)
    const groupsByRoot = new Map<string, ReplyGroup[]>()

    for (const c of comments) {
      if (!c.parentId) continue
      // 找到最顶层的父评论 ID
      let topId = c.id
      let current: Comment | undefined = c
      while (current?.parentId) {
        const p = commentMap.get(current.parentId)
        if (!p) break
        current = p
        topId = p.parentId ? topId : current.id
      }
      if (!topId) continue

      // 计算深度
      let depth = 0
      let cur: Comment | undefined = c
      while (cur?.parentId) {
        depth++
        cur = commentMap.get(cur.parentId)
      }

      // 找直接父评论的作者和颜色（用于 "xxx 回复 yyy"）
      const directParent = c.parentId ? commentMap.get(c.parentId) : undefined

      if (!groupsByRoot.has(topId)) groupsByRoot.set(topId, [])
      groupsByRoot.get(topId)!.push({
        comment: c,
        depth,
        parentAuthor: directParent?.author,
        parentColor: directParent?.authorColor,
      })
    }

    // 每组按时间排序
    for (const [, list] of groupsByRoot) {
      list.sort((a, b) => new Date(b.comment.date).getTime() - new Date(a.comment.date).getTime())
    }

    return { topLevel, groupsByRoot }
  }, [comments, commentMap])

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>💬 评论区</h2>

      <CommentForm
        onSubmit={handleAdd}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
      />

      {loading && <p className={styles.loading}>加载评论中…</p>}
      {error && <p className={styles.error}>❌ {error}</p>}
      {!loading && !error && comments.length === 0 && (
        <p className={styles.empty}>暂无评论，来写第一条吧 ✏️</p>
      )}

      {!loading && !error && groups.topLevel.length > 0 && (
        <div className={styles.list}>
          {groups.topLevel.map((top) => {
            const replies = groups.groupsByRoot.get(top.id) ?? []
            return (
              <div key={top.id} className={styles.topGroup}>
                {/* 顶层评论卡片 */}
                <CommentCard comment={top} onReply={handleReplyClick} canDelete={canDelete(top.userId)} onDelete={handleDelete} />

                {/* 扁平回复列表 */}
                {replies.length > 0 && (
                  <div className={styles.replies}>
                    {replies.map((r) => (
                      <UnifiedReply
                        key={r.comment.id}
                        comment={r.comment}
                        parentAuthor={r.parentAuthor}
                        parentColor={r.parentColor}
                        onReply={handleReplyClick}
                        canDelete={canDelete(r.comment.userId)}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/* ==============================================================
   CommentForm — 评论输入框（含回复标签）
   ============================================================== */
function CommentForm({
  onSubmit,
  replyTarget,
  onClearReply,
}: {
  onSubmit: (input: { author: string; content: string; userId?: string }) => Promise<void>
  replyTarget: { id: string; author: string } | null
  onClearReply: () => void
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 从登录 session 获取 username 作为评论作者标识
  const session = getSession()
  const author = session?.username || '匿名'
  const userId = session?.userId

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ author, content: content.trim(), userId })
      setContent('')
    } catch (e: any) {
      alert(e?.message || '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {replyTarget && (
        <div className={styles.replyTag}>
          <span>
            回复 <strong>{replyTarget.author}</strong>
          </span>
          <button type="button" className={styles.replyTagClose} onClick={onClearReply} title="取消回复">
            ✕
          </button>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="comment-content">
          {replyTarget ? `回复 ${replyTarget.author}：` : `评论（@${author}）：`}
        </label>
        <textarea
          id="comment-content"
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={2000}
        />
      </div>
      <button className={styles.submitBtn} type="submit" disabled={submitting || !content.trim()}>
        {submitting ? '提交中…' : '发表评论'}
      </button>
    </form>
  )
}

/* ==============================================================
   CommentCard — 顶层评论卡片
   ============================================================== */
function CommentCard({
  comment,
  onReply,
  canDelete,
  onDelete,
}: {
  comment: Comment
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className={styles.comment}>
      <div className={styles.commentMeta}>
        <span className={`${styles.commentAuthor} ${getAuthorColor(comment.authorColor)}`}>{comment.author}</span>
        {canDelete && (
          <button
            className={styles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }}
            title="删除"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.commentDate}>{formatDate(comment.date)}</span>
      </div>
      <div
        className={styles.commentBody}
        onClick={() => onReply(comment.id, comment.author)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onReply(comment.id, comment.author)
        }}
      >
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
}

/* ==============================================================
   UnifiedReply — 所有回复统一格式（两行：meta + 多行内容）
   ============================================================== */
function UnifiedReply({
  comment,
  parentAuthor,
  parentColor,
  onReply,
  canDelete,
  onDelete,
}: {
  comment: Comment
  parentAuthor?: string
  parentColor?: string
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}) {
  return (
    <div className={styles.unifiedReply}>
      <div className={styles.replyMeta}>
        <span className={`${styles.replyAuthor} ${getAuthorColor(comment.authorColor)}`}>{comment.author}</span>
        <span className={styles.replyVerb}> 回复 </span>
        <span className={`${styles.replyTarget} ${getAuthorColor(parentColor)}`}>{parentAuthor ?? '未知'}</span>
        {canDelete && (
          <button
            className={styles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }}
            title="删除"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={styles.replyDate}>{formatDate(comment.date)}</span>
      </div>
      <div
        className={styles.replyContent}
        onClick={() => onReply(comment.id, comment.author)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onReply(comment.id, comment.author)
        }}
      >
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
}

/* ==============================================================
   工具函数
   ============================================================== */
/** 根据颜色字面值返回 CSS 颜色类名 */
function getAuthorColor(color?: string): string {
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
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}





