'use client'

import { useCallback, useEffect, useState } from 'react'
import CommentSection from '@/components/CommentSection'
import type { UnifiedComment } from '@/components/CommentSection'
import { fetchUserMessages, addUserMessage, deleteUserMessage } from '@/lib/gist-api'
import commentStyles from '@/styles/comment.module.css'

/**
 * 用户主页留言板 — 以受控模式包装 CommentSection。
 * 外层负责标题与卡片外壳，本组件只管数据加载 / 提交 / 删除。
 */
export default function MessageBoard({
  targetUserId,
  targetCommentId,
  scrollKey,
}: {
  targetUserId: string
  /** 通知跳转锚点：需要滚动到的那条留言 */
  targetCommentId?: string | null
  /** 锚点刷新 key：URL 中 comment id 变化时触发重新滚动 */
  scrollKey?: number
}) {
  const [comments, setComments] = useState<UnifiedComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchUserMessages(targetUserId)
      setComments(data.map((m): UnifiedComment => ({
        id: m.id,
        parentId: m.parent_id,
        author: m.author_username,
        authorId: m.author_id,
        content: m.content,
        createdAt: m.created_at,
        deleted: m.deleted,
      })))
    } catch (e: unknown) {
      setError((e as { message?: string } | null)?.message ?? '加载留言失败')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [targetUserId])

  // 初始/换人加载：通过微任务触发，避免在 effect 内同步调用含 setState 的函数
  useEffect(() => { Promise.resolve().then(() => load()) }, [load])

  const handleSubmit = useCallback(async (content: string, parentId?: string) => {
    await addUserMessage(targetUserId, content, parentId)
    await load(true)
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [targetUserId, load])

  const handleDelete = useCallback(async (commentId: string) => {
    await deleteUserMessage(commentId)
    await load(true)
  }, [load])

  // 首次加载 / 加载出错：走独立状态提示；加载完成后交给 CommentSection 渲染
  if (loading && comments.length === 0) {
    return <p className={commentStyles.loading}>加载留言中…</p>
  }
  if (error && comments.length === 0) {
    return <p className={commentStyles.error}>❌ {error}</p>
  }

  return (
    <CommentSection
      comments={comments}
      onSubmit={handleSubmit}
      onDelete={handleDelete}
      extraDeleteUserId={targetUserId}
      targetCommentId={targetCommentId}
      scrollKey={scrollKey}
      hideTitle
    />
  )
}
