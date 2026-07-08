'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchComments, addComment } from '@/lib/gist-api'
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

    fetchComments()
      .then((all) => {
        if (cancelled) return
        setComments((all[pageSlug] ?? []).filter((c) => c.status === 'approved'))
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
    async (input: { author: string; content: string }) => {
      await addComment(pageSlug, { ...input, parentId: replyTarget?.id })
      setReplyTarget(null)
      // 软刷新
      const all = await fetchComments()
      setComments((all[pageSlug] ?? []).filter((c) => c.status === 'approved'))
    },
    [pageSlug, replyTarget],
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

      // 找直接父评论的作者（用于 "xxx 回复 yyy"）
      const directParent = c.parentId ? commentMap.get(c.parentId) : undefined

      if (!groupsByRoot.has(topId)) groupsByRoot.set(topId, [])
      groupsByRoot.get(topId)!.push({
        comment: c,
        depth,
        parentAuthor: directParent?.author,
      })
    }

    // 每组按时间排序
    for (const [, list] of groupsByRoot) {
      list.sort((a, b) => new Date(a.comment.date).getTime() - new Date(b.comment.date).getTime())
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
                <CommentCard comment={top} onReply={handleReplyClick} />

                {/* 扁平回复列表 */}
                {replies.length > 0 && (
                  <div className={styles.replies}>
                    {replies.map((r) => (
                      <UnifiedReply
                        key={r.comment.id}
                        comment={r.comment}
                        parentAuthor={r.parentAuthor}
                        onReply={handleReplyClick}
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
  onSubmit: (input: { author: string; content: string }) => Promise<void>
  replyTarget: { id: string; author: string } | null
  onClearReply: () => void
}) {
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({ author: author.trim() || '匿名', content: content.trim() })
      setContent('')
    } catch {
      alert('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="comment-author">昵称（选填）</label>
        <input
          id="comment-author"
          type="text"
          placeholder="匿名"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          maxLength={30}
        />
      </div>

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
          {replyTarget ? `回复 ${replyTarget.author}：` : '说点什么…'}
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
}: {
  comment: Comment
  onReply: (id: string, author: string) => void
}) {
  return (
    <div className={styles.comment}>
      <div className={styles.commentMeta}>
        <span className={styles.commentAuthor}>{comment.author}</span>
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
  onReply,
}: {
  comment: Comment
  parentAuthor?: string
  onReply: (id: string, author: string) => void
}) {
  return (
    <div className={styles.unifiedReply}>
      <div className={styles.replyMeta}>
        <span className={styles.replyAuthor}>{comment.author}</span>
        <span className={styles.replyVerb}> 回复 </span>
        <span className={styles.replyTarget}>{parentAuthor ?? '未知'}</span>
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
