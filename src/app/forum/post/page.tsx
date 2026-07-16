'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import {
  fetchForumPost,
  fetchForumComments,
  addForumComment,
  deleteForumComment,
  voteForumPost,
  removeForumVote,
  getUserForumVote,
  updateForumPost,
  fetchAllUsers,
} from '@/lib/gist-api'
import CommentSection from '@/components/CommentSection'
import type { UnifiedComment } from '@/components/CommentSection'
import VisibilityBar from '@/components/VisibilityBar'
import VisibilityModal from '@/components/VisibilityModal'
import type { ForumPost, ForumComment, UserInfo } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import { UserName } from '@/components/UserName'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import { showWarningToast } from '@/lib/toast'
import { useAutoSave, loadDraft } from '@/hooks/useAutoSave'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function ForumPostPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const postId = searchParams.get('id') || ''
  const commentId = searchParams.get('comment')
  const requestKey = useMemo(() => commentId ? searchParams.toString() : '', [searchParams, commentId])

  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{ userId: string; username: string } | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editExcludedIds, setEditExcludedIds] = useState<string[]>([])
  const [editAgentVisible, setEditAgentVisible] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)
  const [refreshCooldown, setRefreshCooldown] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [scrollReady, setScrollReady] = useState(false)

  /** 有 commentId 时：等所有内容（含动态 MarkdownEditor）加载完毕后再跳转 */
  useEffect(() => {
    if (loading || !commentId || scrollReady) return
    const timer = setTimeout(() => setScrollReady(true), 80)
    return () => clearTimeout(timer)
  }, [loading, commentId, scrollReady])

  /** 全量加载（首次 / 出错时用） */
  const load = useCallback(async () => {
    if (!postId) return
    try {
      setLoading(true)
      setError(null)
      const [p, c, s, v] = await Promise.all([
        fetchForumPost(postId),
        fetchForumComments(postId),
        getSession(),
        getUserForumVote(postId).catch(() => null),
      ])
      if (!p) { setError('帖子不存在'); return }
      setPost(p)
      setComments(c)
      setSession(s)
      setMyVote(v)
      fetchAllUsers().then(setAllUsers).catch(() => {}).finally(() => setUsersLoading(false))
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [postId])

  /** 局部刷新：只重拉帖子 + 我的投票（投票后、编辑后），不触发 loading */
  const refreshPostOnly = useCallback(async () => {
    if (!postId) return
    try {
      const [p, v] = await Promise.all([
        fetchForumPost(postId),
        getUserForumVote(postId).catch(() => null),
      ])
      if (p) { setPost(p); setMyVote(v) }
    } catch {}
  }, [postId])

  /** 局部刷新：只重拉评论列表（评论增删后），不触发 loading */
  const refreshCommentsOnly = useCallback(async () => {
    if (!postId) return
    try {
      const c = await fetchForumComments(postId)
      setComments(c)
    } catch {}
  }, [postId])

  useEffect(() => { load() }, [load])

  // 客户端初始化：加载拼音首字母
  useEffect(() => { loadPinyinInitialsFromDB() }, [])

  // 编辑模式草稿恢复
  useEffect(() => {
    if (!postId) return
    interface DraftData {
      title: string
      content: string
      excludedUserIds: string[]
    }
    const draft = loadDraft<DraftData>(`forum_edit_${postId}`)
    if (draft && postId) {
      // 有草稿时自动进入编辑模式
      if (draft.title) setEditTitle(draft.title)
      if (draft.content) setEditContent(draft.content)
      if (draft.excludedUserIds) setEditExcludedIds(draft.excludedUserIds)
      if ('agentVisible' in draft) setEditAgentVisible((draft as any).agentVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 编辑模式自动保存草稿
  const editHasContent = editTitle.trim() !== '' || editContent.trim() !== ''
  const { clearDraft: clearEditDraft } = useAutoSave({
    key: `forum_edit_${postId}`,
    data: { title: editTitle, content: editContent, excludedUserIds: editExcludedIds, agentVisible: editAgentVisible },
    enabled: editing && editHasContent,
  })

  /** 如果 URL 带 ?comment=xxx 但评论不存在或已被删除，显示警告 */
  useEffect(() => {
    if (loading || !commentId) return
    const match = comments.find((c) => c.id === commentId)
    if (!match || match.deleted) showWarningToast('该评论可能已被删除')
  }, [loading, commentId, comments])

  const handleVote = async (type: 'up' | 'down') => {
    if (!post) return
    // 乐观更新：立即反映 UI
    const prevVote = myVote
    setPost((p) => {
      if (!p) return p
      const next = { ...p }
      // 撤销之前的投票（如果有）
      if (prevVote === 'up') next.upvotes = Math.max(0, (next.upvotes ?? 0) - 1)
      if (prevVote === 'down') next.downvotes = Math.max(0, (next.downvotes ?? 0) - 1)
      if (type !== prevVote) {
        // 新投票
        if (type === 'up') next.upvotes = (next.upvotes ?? 0) + 1
        if (type === 'down') next.downvotes = (next.downvotes ?? 0) + 1
        setMyVote(type)
      } else {
        setMyVote(null)
      }
      return next
    })
    try {
      if (myVote === type) {
        await removeForumVote(post.id)
      } else {
        await voteForumPost(post.id, type)
      }
      // 后台同步确保一致性
      refreshPostOnly()
    } catch {
      // 回滚
      setMyVote(prevVote)
      refreshPostOnly()
    }
  }

  const startEdit = () => {
    if (!post) return
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditExcludedIds(post.excluded_visibility ?? [])
    setEditAgentVisible(post.agent_visible ?? true)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
    setEditExcludedIds([])
    clearEditDraft()
  }

  const submitEdit = async () => {
    if (!post || !editTitle.trim() || !editContent.trim() || submitting) return
    setSubmitting(true)
    try {
      await updateForumPost(post.id, editTitle.trim(), editContent.trim(), editExcludedIds, editAgentVisible)
      clearEditDraft()
      setEditing(false)
      refreshPostOnly()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  const handleNewComment = async (content: string, parentId?: string) => {
    try {
      await addForumComment(postId, content, parentId)
      // 只刷新评论列表，不触发全量 loading
      refreshCommentsOnly()
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteForumComment(commentId)
      // 同时刷新评论和帖子（评论数更新）
      await Promise.all([refreshCommentsOnly(), refreshPostOnly()])
    } catch (e: any) { setError(e.message) }
  }

  /** 手动刷新评论（10s 冷却） */
  const handleRefreshComments = useCallback(async () => {
    if (refreshCooldown > 0) return
    setSpinning(true)
    setRefreshCooldown(10)
    await refreshCommentsOnly()
    setSpinning(false)
    // 倒计时冷却
    const timer = setInterval(() => {
      setRefreshCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [refreshCooldown, refreshCommentsOnly])

  const isAuthor = session && post && session.userId === post.author_id
  const editExcludedUsers = allUsers.filter((u) => editExcludedIds.includes(u.id))
  const unifiedComments = useMemo(() => comments.map((c): UnifiedComment => ({
    id: c.id,
    parentId: c.parent_id ?? null,
    author: c.author_username,
    authorId: c.author_id,
    content: c.content,
    createdAt: c.created_at,
    deleted: c.deleted,
  })), [comments])

  if (!postId) return <div className={styles.page}><p>缺少帖子 ID</p></div>
  if (loading) return <div className={styles.page}><p className={styles.loading}>加载中&hellip;</p></div>
  if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
  if (!post) return <div className={styles.page}><p className={styles.error}>❌ 帖子不存在</p></div>

  return (
    <>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderInner}>
          <div className={styles.detailTitleRow}>
            {editing ? (
              <input
                className={styles.titleInput}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
                autoFocus
              />
            ) : (
              <h1 className={styles.detailTitle} dangerouslySetInnerHTML={{ __html: renderClient(post.title) }} />
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              {isAuthor && !editing && (
                <button className={styles.backBtnIcon} onClick={startEdit} title="编辑帖子">
                  <FaIcon name="pen" />
                </button>
              )}
              <button className={styles.backBtnIcon} onClick={editing ? cancelEdit : () => router.push('/forum')} title={editing ? '取消编辑' : '返回讨论区'}>
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
          <div className={styles.detailMeta}>
            <UserName username={post.author_username} className={styles.detailAuthor} />
            <span>发布于 {formatDate(post.created_at)}</span>
            {post.updated_at !== post.created_at && (
              <span>编辑于 {formatDate(post.updated_at)}</span>
            )}
            {editing && <span style={{ color: 'var(--color-primary)' }}>编辑中</span>}
          </div>
        </div>
      </div>

      <div className={styles.page} style={{ paddingTop: 0 }}>
        {editing ? (
          <div className={styles.newPostForm}>
            <VisibilityBar
              excludedUsers={editExcludedUsers}
              onOpenModal={() => setShowVisibilityModal(true)}
              onRemoveExclude={(userId) =>
                setEditExcludedIds((prev) => prev.filter((id) => id !== userId))
              }
              agentVisible={editAgentVisible}
              onAgentVisibleChange={setEditAgentVisible}
            />
            <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
              <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} />
            </div>
            <div className={styles.formActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEdit}>取消</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitEdit} disabled={submitting}>
                {submitting ? '保存中&hellip;' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.detail}>
            <div className={styles.detailBody}>
              <WikiContent content={post.content} className="wiki-body" />
            </div>

            <div className={styles.voteBar}>
              <button className={`${styles.voteIcon} ${myVote === 'up' ? styles.voteIconActiveUp : ''}`}
                onClick={() => handleVote('up')} title="赞"><FaIcon name="thumbs-up" /></button>
              <span className={`${styles.voteCount} ${(post.upvotes ?? 0) > 0 ? styles.voteCountPositive : ''}`}>{post.upvotes ?? 0}</span>
              <button className={`${styles.voteIcon} ${myVote === 'down' ? styles.voteIconActiveDown : ''}`}
                onClick={() => handleVote('down')} title="踩"><FaIcon name="thumbs-down" /></button>
              <span className={`${styles.voteCount} ${(post.downvotes ?? 0) > 0 ? styles.voteCountNegative : ''}`}>{post.downvotes ?? 0}</span>
            </div>

            <div className={styles.commentSectionHeader}>
              <h3 className={styles.commentSectionTitle}>💬 评论</h3>
              <button
                className={`${styles.refreshBtn} ${refreshCooldown > 0 ? styles.refreshBtnCooling : ''}`}
                onClick={handleRefreshComments}
                disabled={refreshCooldown > 0}
                title={refreshCooldown > 0 ? `${refreshCooldown}s 后可刷新` : '刷新评论'}
              >
                <FaIcon name="sync-alt" spin={spinning} />
                {refreshCooldown > 0 && <span className={styles.refreshCooldown}>{refreshCooldown}s</span>}
              </button>
            </div>
            <CommentSection
              comments={unifiedComments}
              onSubmit={handleNewComment}
              onDelete={handleDeleteComment}
              targetCommentId={scrollReady ? commentId : null}
              scrollKey={scrollReady ? (requestKey ? requestKey.length : 0) : 0}
              hideTitle
            />
          </div>
        )}
      </div>

      {showVisibilityModal && (
        <VisibilityModal
          allUsers={allUsers}
          usersLoading={usersLoading}
          excludedUserIds={editExcludedIds}
          onToggle={(userId) =>
            setEditExcludedIds((prev) =>
              prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
            )
          }
          onClose={() => setShowVisibilityModal(false)}
        />
      )}
    </>
  )
}

