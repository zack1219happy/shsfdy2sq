'use client'

import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { getSession, canDeleteComment } from '@/lib/auth'
import type { Comment as WikiComment } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import { useCommentAnchor } from '@/hooks/useCommentAnchor'
import { UserName } from '@/components/UserName'
import { showWarningToast } from '@/lib/toast'
import WikiContent from '@/components/WikiContent'
import commentStyles from '@/styles/comment.module.css'

// ============================================================
// 统一评论类型 — wiki Comment 和 ForumComment 的抽象
// ============================================================

export interface UnifiedComment {
  id: string
  parentId: string | null
  author: string
  /** 用于删除权限判断的 userId。可选，为空时仅 admin 可删 */
  authorId?: string
  content: string
  createdAt: string
  deleted: boolean
}

// ============================================================
// Props
// ============================================================

interface CommentSectionProps {
  /**
   * 评论数据。带 pageSlug 时进入「自取模式」：组件自动从 gist-api
   * 获取/添加/删除评论。不带时进入「受控模式」：完全由外界管理数据。
   */
  pageSlug?: string
  /** 受控模式：外界提供的评论列表 */
  comments?: UnifiedComment[]
  /** 受控模式：添加评论 */
  onSubmit?: (content: string, parentId?: string) => Promise<void>
  /** 受控模式：删除评论 */
  onDelete?: (commentId: string) => Promise<void>

  /** 评论锚点滚动（直接跳转到某条评论） */
  targetCommentId?: string | null
  /** 触发锚点滚动刷新的 key */
  scrollKey?: number
  /** 隐藏默认的标题栏（由父组件自定义） */
  hideTitle?: boolean
}

// ============================================================
// 主组件
// ============================================================

export default function CommentSection({
  pageSlug,
  comments: externalComments,
  onSubmit: externalOnSubmit,
  onDelete: externalOnDelete,
  targetCommentId: externalTargetId,
  scrollKey: externalScrollKey,
  hideTitle,
}: CommentSectionProps) {
  // ---- 自取模式 vs 受控模式 ----
  const isSelfManaged = !!pageSlug
  const [localComments, setLocalComments] = useState<UnifiedComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null)

  const comments = isSelfManaged ? localComments : (externalComments ?? [])
  const session = getSession()

  // 锚点：自取模式从 URL 解析，受控模式从 props 读取
  const [urlCommentId, setUrlCommentId] = useState<string | null>(null)
  const [urlNonce, setUrlNonce] = useState(0)

  useEffect(() => {
    if (!isSelfManaged) return
    const params = new URLSearchParams(window.location.search)
    const commentId = params.get('comment')
    if (commentId) {
      setUrlCommentId(commentId)
      setUrlNonce((n) => n + 1)
    } else {
      setUrlCommentId(null)
    }
  }, [pageSlug, isSelfManaged])

  const effectiveTargetId = isSelfManaged ? urlCommentId : externalTargetId
  const effectiveScrollKey = isSelfManaged ? urlNonce : (externalScrollKey ?? 0)
  const anchorRef = useCommentAnchor(commentStyles.highlight, effectiveScrollKey)

  // ---- 自取模式下的数据初始化 ----
  useEffect(() => {
    if (!isSelfManaged) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setReplyTarget(null)

    import('@/lib/gist-api').then(({ fetchPageComments }) =>
      fetchPageComments(pageSlug!)
        .then((data) => {
          if (cancelled) return
          setLocalComments(normalizeWikiComments(data))
        })
        .catch((e: Error) => {
          if (cancelled) return
          setError(e.message ?? '加载评论失败')
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    )

    return () => { cancelled = true }
  }, [pageSlug, isSelfManaged])

  // 自取模式：目标评论不存在时警告
  useEffect(() => {
    if (loading || !urlCommentId) return
    const match = comments.find((c) => c.id === urlCommentId)
    if (!match || match.deleted) showWarningToast('该评论可能已被删除')
  }, [loading, urlCommentId, comments])

  // ---- 操作 ----

  const handleSubmit = useCallback(async (content: string, parentId?: string) => {
    if (isSelfManaged && pageSlug) {
      const { addComment, fetchPageComments } = await import('@/lib/gist-api')
      const session = getSession()
      await addComment(pageSlug, {
        author: session?.username || '匿名',
        content,
        parentId,
      })
      setReplyTarget(null)
      const data = await fetchPageComments(pageSlug)
      setLocalComments(normalizeWikiComments(data))
      window.dispatchEvent(new CustomEvent('new-notification'))
    } else if (externalOnSubmit) {
      await externalOnSubmit(content, parentId)
      setReplyTarget(null)
    }
  }, [isSelfManaged, pageSlug, externalOnSubmit])

  const handleDelete = useCallback(async (commentId: string) => {
    if (isSelfManaged && pageSlug) {
      const { deleteComment, fetchPageComments } = await import('@/lib/gist-api')
      await deleteComment(commentId)
      const data = await fetchPageComments(pageSlug)
      setLocalComments(normalizeWikiComments(data))
    } else if (externalOnDelete) {
      await externalOnDelete(commentId)
    }
  }, [isSelfManaged, pageSlug, externalOnDelete])

  const canDelete = useCallback(
    (authorId?: string) => canDeleteComment(session, authorId),
    [session],
  )

  const handleReplyClick = useCallback((id: string, author: string) => {
    setReplyTarget((prev) => (prev?.id === id ? null : { id, author }))
  }, [])

  // ---- 评论树 ----

  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  // ---- 渲染 ----

  return (
    <section className={`${commentStyles.section} ${hideTitle ? commentStyles.sectionNoTitle : ''}`}>
      {!hideTitle && <h2 className={commentStyles.title}>💬 评论区</h2>}

      <CommentForm
        onSubmit={handleSubmit}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
      />

      {loading && <p className={commentStyles.loading}>加载评论中…</p>}
      {error && <p className={commentStyles.error}>❌ {error}</p>}
      {!loading && !error && comments.length === 0 && (
        <p className={commentStyles.empty}>暂无评论，来写第一条吧 ✏️</p>
      )}

      {!loading && !error && commentTree.topLevel.length > 0 && (
        <div className={commentStyles.list}>
          {commentTree.topLevel.map((top) => {
            const replies = commentTree.repliesByRoot.get(top.id) ?? []
            return (
              <div key={top.id} className={commentStyles.topGroup}>
                <CommentCard
                  ref={top.id === effectiveTargetId ? anchorRef : undefined}
                  comment={top}
                  onReply={handleReplyClick}
                  canDelete={canDelete(top.authorId)}
                  onDelete={handleDelete}
                />
                {replies.length > 0 && (
                  <div className={commentStyles.replies}>
                    {replies.map((r) => (
                      <UnifiedReply
                        key={r.comment.id}
                        ref={r.comment.id === effectiveTargetId ? anchorRef : undefined}
                        comment={r.comment}
                        parentAuthor={r.parentAuthor}
                        onReply={handleReplyClick}
                        canDelete={canDelete(r.comment.authorId)}
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

// ============================================================
// 构建评论树（顶层评论 + 根部平铺回复）
// ============================================================

interface ReplyInfo {
  comment: UnifiedComment
  parentAuthor?: string
}

interface CommentTree {
  topLevel: UnifiedComment[]
  repliesByRoot: Map<string, ReplyInfo[]>
}

function buildCommentTree(comments: UnifiedComment[]): CommentTree {
  const commentMap = new Map<string, UnifiedComment>()
  for (const c of comments) commentMap.set(c.id, c)

  // 收集每条回复的根部父评论 id
  const rootMap = new Map<string, ReplyInfo[]>()
  for (const c of comments) {
    if (!c.parentId) continue

    // 找到最顶层父评论的 id
    let topId = c.id
    let current: UnifiedComment | undefined = c
    while (current?.parentId) {
      const p = commentMap.get(current.parentId)
      if (!p) break
      current = p
      topId = p.parentId ? topId : current.id
    }
    if (!topId) continue

    // 找直接父评论的作者
    const directParent = c.parentId ? commentMap.get(c.parentId) : undefined

    if (!rootMap.has(topId)) rootMap.set(topId, [])
    rootMap.get(topId)!.push({
      comment: c,
      parentAuthor: directParent?.author,
    })
  }

  // 每组按时间正序，同时过滤掉"已删除且无子回复"的回复
  for (const [topId, list] of rootMap) {
    // 构建子回复的 parent → child 关系（在 root 内部）
    const childIds = new Set<string>()
    for (const item of list) {
      if (item.comment.parentId) childIds.add(item.comment.parentId)
    }
    // 已删除且没有任何人引用它为 direct parent → 过滤掉
    const filtered = list.filter((item) => {
      if (!item.comment.deleted) return true
      return childIds.has(item.comment.id)
    })
    filtered.sort((a, b) =>
      new Date(a.comment.createdAt).getTime() - new Date(b.comment.createdAt).getTime()
    )
    if (filtered.length > 0) {
      rootMap.set(topId, filtered)
    } else {
      rootMap.delete(topId)
    }
  }

  // 顶层评论：已删除且无子回复的彻底隐藏
  const topLevel = comments.filter((c) => {
    if (c.parentId) return false
    // 已删除但还有子回复 → 保留（占位符表示评论已删除，但下面还有回复可看）
    if (c.deleted) return rootMap.has(c.id)
    return true
  })

  // 顶层按时间倒序（最新在上）
  topLevel.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return { topLevel, repliesByRoot: rootMap }
}

// ============================================================
// 归一化：wiki Comment → UnifiedComment
// ============================================================

function normalizeWikiComments(raw: WikiComment[]): UnifiedComment[] {
  return raw.map((c) => ({
    id: c.id,
    parentId: c.parentId ?? null,
    author: c.author,
    authorId: c.userId,
    content: c.content,
    createdAt: c.date,
    deleted: c.deleted ?? false,
  }))
}

// ============================================================
// 子组件
// ============================================================

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/* ---------- CommentForm ---------- */

function CommentForm({
  onSubmit,
  replyTarget,
  onClearReply,
}: {
  onSubmit: (content: string, parentId?: string) => Promise<void>
  replyTarget: { id: string; author: string } | null
  onClearReply: () => void
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
      alert(e?.message || '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={commentStyles.form}>
      {replyTarget && (
        <div className={commentStyles.replyTag}>
          <span>
            回复 <strong>{replyTarget.author}</strong>
          </span>
          <button type="button" className={commentStyles.replyTagClose} onClick={onClearReply} title="取消回复">
            ✕
          </button>
        </div>
      )}

      <div className={commentStyles.editorWrap}>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          config={{ preview: false, fullScreen: false, scrollSync: false }}
          className={commentStyles.editorWrapInner}
        />
      </div>

      <button className={commentStyles.submitBtn} type="button" onClick={handleSubmit} disabled={submitting || !content.trim()}>
        {submitting ? '提交中…' : replyTarget ? '回复' : '发表评论'}
      </button>
    </div>
  )
}

/* ---------- CommentCard ---------- */

const CommentCard = forwardRef<HTMLDivElement, {
  comment: UnifiedComment
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function CommentCard({ comment, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${commentStyles.comment} ${commentStyles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={commentStyles.commentMeta}>
          <UserName username={comment.author} className={commentStyles.commentAuthor} />
          <span className={commentStyles.deletedLabel}>该评论已被删除</span>
          <span className={commentStyles.commentDate}>{formatDate(comment.createdAt)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={commentStyles.comment} id={`comment-${comment.id}`}>
      <div
        className={commentStyles.commentMeta}
        role="button"
        tabIndex={0}
        onClick={() => onReply(comment.id, comment.author)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author} className={commentStyles.commentAuthor} />
        {canDelete && (
          <button
            className={commentStyles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }}
            title="删除"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={commentStyles.commentDate}>{formatDate(comment.createdAt)}</span>
      </div>
      <div className={commentStyles.commentBody}>
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
})

/* ---------- UnifiedReply ---------- */

const UnifiedReply = forwardRef<HTMLDivElement, {
  comment: UnifiedComment
  parentAuthor?: string
  onReply: (id: string, author: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function UnifiedReply({ comment, parentAuthor, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${commentStyles.unifiedReply} ${commentStyles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={commentStyles.replyMeta}>
          <UserName username={comment.author} className={commentStyles.replyAuthor} />
          <span className={commentStyles.replyVerb}> 回复 </span>
          {parentAuthor ? <UserName username={parentAuthor} className={commentStyles.replyTarget} /> : <span className={commentStyles.replyTarget}>未知</span>}
          <span className={commentStyles.deletedLabel}>该评论已被删除</span>
          <span className={commentStyles.replyDate}>{formatDate(comment.createdAt)}</span>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={commentStyles.unifiedReply} id={`comment-${comment.id}`}>
      <div
        className={commentStyles.replyMeta}
        role="button"
        tabIndex={0}
        onClick={() => onReply(comment.id, comment.author)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author} className={commentStyles.replyAuthor} />
        <span className={commentStyles.replyVerb}> 回复 </span>
        {parentAuthor ? <UserName username={parentAuthor} className={commentStyles.replyTarget} /> : <span className={commentStyles.replyTarget}>未知</span>}
        {canDelete && (
          <button
            className={commentStyles.deleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(comment.id) }}
            title="删除"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M3 4l1 10h8l1-10"/>
            </svg>
          </button>
        )}
        <span className={commentStyles.replyDate}>{formatDate(comment.createdAt)}</span>
      </div>
      <div className={commentStyles.replyContent}>
        <WikiContent content={comment.content} />
      </div>
    </div>
  )
})
