'use client'

import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { getSession, canDeleteComment } from '@/lib/auth'
import type { CommentSource, UnifiedComment } from '@/lib/api/comments'
import { addComment, deleteComment, fetchComments } from '@/lib/api/comments'
import { formatDate } from '@/lib/forum'
import { useCommentAnchor } from '@/hooks/useCommentAnchor'
import { UserName } from '@/components/UserName'
import { useUserById } from '@/lib/user-colors'
import { showWarningToast } from '@/lib/toast'
import WikiContent from '@/components/WikiContent'
import FaIcon from '@/components/FaIcon'
import commentStyles from '@/styles/comment.module.css'

// ============================================================
// 全站统一评论区 — 唯一用法：
//   <CommentSection source="forum" targetId={postId} />
// 组件自取数据、解析 ?comment= 锚点、提供刷新按钮。
// ============================================================

interface CommentSectionProps {
  /** 评论来源板块 */
  source: CommentSource
  /** 目标：wiki 页面 slug / 帖子 id / 文章 id / 许愿 id / 主页主人 userId */
  targetId: string
  /** 标题文字（hideTitle=false 时显示，默认「评论区」） */
  title?: string
  /** 隐藏标题（宿主页面自带标题时用；刷新按钮仍保留） */
  hideTitle?: boolean
  /** 嵌入宿主卡片时去掉评论区自身的上边距和分隔线 */
  embedded?: boolean
  /**
   * 锚点重扫信号：该值变化时组件重新解析 URL 的 ?comment= 参数。
   * 同页导航（如 mypage 切换用户）时由宿主传入以触发重滚。
   */
  scrollKey?: string | number
}

export default function CommentSection({
  source,
  targetId,
  title,
  hideTitle,
  embedded,
  scrollKey = 0,
}: CommentSectionProps) {
  const [comments, setComments] = useState<UnifiedComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string; authorId?: string } | null>(null)
  // 手动刷新（10s 冷却）
  const [refreshCooldown, setRefreshCooldown] = useState(0)
  const [spinning, setSpinning] = useState(false)

  const session = getSession()

  // ---- URL 锚点解析 ----
  // source/targetId/scrollKey 任一变化时重新读取 ?comment=
  const [anchor, setAnchor] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 })
  const [syncPrev, setSyncPrev] = useState<string | null>(null)
  const syncKey = `${source}|${targetId}|${scrollKey}`
  if (syncPrev !== syncKey) {
    setSyncPrev(syncKey)
    if (typeof window !== 'undefined') {
      const commentId = new URLSearchParams(window.location.search).get('comment')
      setAnchor((prev) => ({ id: commentId, nonce: prev.nonce + 1 }))
    } else {
      setAnchor((prev) => ({ id: null, nonce: prev.nonce + 1 }))
    }
    setLoading(true)
    setError(null)
    setReplyTarget(null)
  }

  const anchorRef = useCommentAnchor(commentStyles.highlight, anchor.nonce)

  // ---- 数据加载 ----
  const load = useCallback(async () => {
    try {
      const data = await fetchComments(source, targetId)
      setComments(data)
      setError(null)
    } catch (e: unknown) {
      setError((e as { message?: string } | null)?.message ?? '加载评论失败')
    } finally {
      setLoading(false)
    }
  }, [source, targetId])

  // 通过微任务触发，避免在 effect 内同步调用含 setState 的函数
  useEffect(() => { Promise.resolve().then(() => load()) }, [load])

  // 目标评论不存在时警告（通知深链指向已删评论）
  useEffect(() => {
    if (loading || !anchor.id) return
    const match = comments.find((c) => c.id === anchor.id)
    if (!match || match.deleted) showWarningToast('该评论可能已被删除')
  }, [loading, anchor.id, comments])

  // ---- 操作 ----

  const handleSubmit = useCallback(async (content: string, parentId?: string) => {
    await addComment(source, targetId, content, parentId)
    setReplyTarget(null)
    await load()
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [source, targetId, load])

  const handleDelete = useCallback(async (commentId: string) => {
    await deleteComment(commentId)
    await load()
  }, [load])

  const handleRefresh = useCallback(async () => {
    if (refreshCooldown > 0) return
    setSpinning(true)
    setRefreshCooldown(10)
    await load()
    setSpinning(false)
    const timer = setInterval(() => {
      setRefreshCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [refreshCooldown, load])

  // 删除权：作者本人 / 管理员；留言板额外允许主页主人
  const canDelete = useCallback(
    (authorId?: string) =>
      canDeleteComment(session, authorId) ||
      (source === 'user_page' && session?.userId === targetId),
    [session, source, targetId],
  )

  const handleReplyClick = useCallback((id: string, author: string, authorId?: string) => {
    setReplyTarget((prev) => (prev?.id === id ? null : { id, author, authorId }))
  }, [])

  // ---- 评论树 ----

  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  // ---- 渲染 ----

  return (
    <section
      className={`${commentStyles.section} ${hideTitle ? commentStyles.sectionNoTitle : ''}`}
      style={embedded ? { marginTop: 0, paddingTop: 0, borderTop: 'none' } : undefined}
    >
      <div className={commentStyles.sectionHeader}>
        {!hideTitle && (
          <h2 className={commentStyles.title}>💬 {title ?? '评论区'}</h2>
        )}
        <button
          className={`${commentStyles.refreshBtn} ${refreshCooldown > 0 ? commentStyles.refreshBtnCooling : ''}`}
          onClick={handleRefresh}
          disabled={refreshCooldown > 0}
          title={refreshCooldown > 0 ? `${refreshCooldown}s 后可刷新` : '刷新评论'}
        >
          <FaIcon name="sync-alt" spin={spinning} />
          {refreshCooldown > 0 && <span className={commentStyles.refreshCooldown}>{refreshCooldown}s</span>}
        </button>
      </div>

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
                  ref={top.id === anchor.id ? anchorRef : undefined}
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
                        ref={r.comment.id === anchor.id ? anchorRef : undefined}
                        comment={r.comment}
                        parentAuthor={r.parentAuthor}
                        parentAuthorId={r.parentAuthorId}
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
  parentAuthorId?: string
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
      parentAuthorId: directParent?.authorId,
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
// 子组件
// ============================================================

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className={commentStyles.editorLoading}>加载编辑器…</div> },
)

/* ---------- CommentForm ---------- */

function CommentForm({
  onSubmit,
  replyTarget,
  onClearReply,
}: {
  onSubmit: (content: string, parentId?: string) => Promise<void>
  replyTarget: { id: string; author: string; authorId?: string } | null
  onClearReply: () => void
}) {
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const replyName = useUserById(replyTarget?.authorId)?.username ?? replyTarget?.author

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(content.trim(), replyTarget?.id)
      setContent('')
    } catch (e: unknown) {
      alert((e as { message?: string } | null)?.message || '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={commentStyles.form}>
      {replyTarget && (
        <div className={commentStyles.replyTag}>
          <span>
            回复 <strong>{replyName}</strong>
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
          previewClassName={commentStyles.editorPreviewContent}
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
  onReply: (id: string, author: string, authorId?: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function CommentCard({ comment, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${commentStyles.comment} ${commentStyles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={commentStyles.commentMeta}>
          <UserName username={comment.author} userId={comment.authorId} className={commentStyles.commentAuthor} />
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
        onClick={() => onReply(comment.id, comment.author, comment.authorId)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author, comment.authorId) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author} userId={comment.authorId} className={commentStyles.commentAuthor} />
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
        <WikiContent content={comment.content} contextUserId={comment.authorId ?? null} />
      </div>
    </div>
  )
})

/* ---------- UnifiedReply ---------- */

const UnifiedReply = forwardRef<HTMLDivElement, {
  comment: UnifiedComment
  parentAuthor?: string
  parentAuthorId?: string
  onReply: (id: string, author: string, authorId?: string) => void
  canDelete: boolean
  onDelete: (id: string) => void
}>(function UnifiedReply({ comment, parentAuthor, parentAuthorId, onReply, canDelete, onDelete }, ref) {
  if (comment.deleted) {
    return (
      <div ref={ref} className={`${commentStyles.unifiedReply} ${commentStyles.commentDeleted}`} id={`comment-${comment.id}`}>
        <div className={commentStyles.replyMeta}>
          <UserName username={comment.author} userId={comment.authorId} className={commentStyles.replyAuthor} />
          <span className={commentStyles.replyVerb}> 回复 </span>
          {parentAuthor ? <UserName username={parentAuthor} userId={parentAuthorId} className={commentStyles.replyTarget} /> : <span className={commentStyles.replyTarget}>未知</span>}
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
        onClick={() => onReply(comment.id, comment.author, comment.authorId)}
        onKeyDown={(e) => { if (e.key === 'Enter') onReply(comment.id, comment.author, comment.authorId) }}
        style={{ cursor: 'pointer' }}
      >
        <UserName username={comment.author} userId={comment.authorId} className={commentStyles.replyAuthor} />
        <span className={commentStyles.replyVerb}> 回复 </span>
        {parentAuthor ? <UserName username={parentAuthor} userId={parentAuthorId} className={commentStyles.replyTarget} /> : <span className={commentStyles.replyTarget}>未知</span>}
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
        <WikiContent content={comment.content} contextUserId={comment.authorId ?? null} />
      </div>
    </div>
  )
})
