'use client'

import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchPageComments, addComment, deleteComment } from '@/lib/gist-api'
import { getSession } from '@/lib/auth'
import type { Comment } from '@/types/gist'
import WikiContent from '@/components/WikiContent'
import { useCommentAnchor } from '@/hooks/useCommentAnchor'
import styles from '@/styles/comment.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

interface Props {
  pageSlug: string
}

interface CommentAnchorRequest {
  pageSlug: string
  commentId: string
  nonce: number
}

/* ==============================================================
   CommentSection — 评论区容器
   ============================================================== */
export default function CommentSection({ pageSlug }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null)

  const [anchorRequest, setAnchorRequest] = useState<CommentAnchorRequest | null>(null)

  const readCommentAnchor = useCallback(() => {
    const hash = window.location.hash
    if (hash.startsWith('#comment-')) {
      const commentId = hash.substring('#comment-'.length)
      if (!commentId) return
      setAnchorRequest((previous) => ({
        pageSlug,
        commentId,
        nonce: (previous?.nonce ?? 0) + 1,
      }))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    } else {
      setAnchorRequest(null)
    }
  }, [pageSlug])

  // Read and clear the hash on mount, route changes, and repeat clicks on this page.
  useEffect(() => {
    readCommentAnchor()
    window.addEventListener('hashchange', readCommentAnchor)
    return () => window.removeEventListener('hashchange', readCommentAnchor)
  }, [readCommentAnchor])

  // 返回 ref 回调：元素进入 DOM 的精确时刻触发滚动 + 高亮
  const anchorRef = useCommentAnchor(styles.highlight, anchorRequest?.nonce ?? 0)

  const currentCommentId = anchorRequest?.pageSlug === pageSlug ? anchorRequest.commentId : null

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
        // 重新拉取（保留软删除标记的评论），确保子评论的树结构完整
        const data = await fetchPageComments(pageSlug)
        setComments(data)
      } catch (e: any) {
        alert(e?.message || '删除失败')
      }
    },
    [session, pageSlug],
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
                <CommentCard
                  ref={top.id === currentCommentId ? anchorRef : undefined}
                  comment={top}
                  onReply={handleReplyClick}
                  canDelete={canDelete(top.userId)}
                  onDelete={handleDelete}
                />

                {/* 扁平回复列表 */}
                {replies.length > 0 && (
                  <div className={styles.replies}>
                    {replies.map((r) => (
                      <UnifiedReply
                        key={r.comment.id}
                        ref={r.comment.id === currentCommentId ? anchorRef : undefined}
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
   CommentForm — 评论输入框（含回复标签 + MarkdownEditor）
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

  const handleSubmit = async () => {
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
    <div className={styles.form}>
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

      <div className={styles.editorWrap}>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          config={{ preview: false, fullScreen: false, scrollSync: false }}
          className={styles.editorWrapInner}
        />
      </div>

      <button className={styles.submitBtn} type="button" onClick={handleSubmit} disabled={submitting || !content.trim()}>
        {submitting ? '提交中…' : replyTarget ? '回复' : '发表评论'}
      </button>
    </div>
  )
}

/* ==============================================================
   CommentCard — 顶层评论卡片
   ============================================================== */
const CommentCard = forwardRef<HTMLDivElement, {
  comment: Comment
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function CommentCard({ comment, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${styles.comment} ${styles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={styles.commentMeta}>
          <span className={`${styles.commentAuthor} ${getAuthorColor(comment.authorColor, comment.author)}`}>{comment.author}</span>
          <span className={styles.deletedLabel}>该评论已被删除</span>
          <span className={styles.commentDate}>{formatDate(comment.date)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={styles.comment} id={`comment-${comment.id}`}>
      <div className={styles.commentMeta}>
        <span className={`${styles.commentAuthor} ${getAuthorColor(comment.authorColor, comment.author)}`}>{comment.author}</span>
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
})

/* ==============================================================
   UnifiedReply — 所有回复统一格式（两行：meta + 多行内容）
   ============================================================== */
const UnifiedReply = forwardRef<HTMLDivElement, {
  comment: Comment
  parentAuthor?: string
  parentColor?: string
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function UnifiedReply({ comment, parentAuthor, parentColor, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${styles.unifiedReply} ${styles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={styles.replyMeta}>
          <span className={`${styles.replyAuthor} ${getAuthorColor(comment.authorColor, comment.author)}`}>{comment.author}</span>
          <span className={styles.replyVerb}> 回复 </span>
          <span className={`${styles.replyTarget} ${getAuthorColor(parentColor)}`}>{parentAuthor ?? '未知'}</span>
          <span className={styles.deletedLabel}>该评论已被删除</span>
          <span className={styles.replyDate}>{formatDate(comment.date)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={styles.unifiedReply} id={`comment-${comment.id}`}>
      <div className={styles.replyMeta}>
        <span className={`${styles.replyAuthor} ${getAuthorColor(comment.authorColor, comment.author)}`}>{comment.author}</span>
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
})

/* ==============================================================
   工具函数
   ============================================================== */
/** 根据颜色字面值或用户名返回 CSS 颜色类名 */
function getAuthorColor(color?: string, username?: string): string {
  // 优先按用户名匹配（数据库可能没有 author_color 值）
  switch (username) {
    case 'tqy': return styles.colorTqy
    case 'zyj': return styles.colorZyj
    case 'DouDou': return styles.colorDouDou
  }
  // 回退：按 DB 存储的 color 值匹配
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
