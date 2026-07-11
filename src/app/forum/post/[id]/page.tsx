'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import {
  fetchForumPost,
  fetchForumComments,
  addForumComment,
  voteForumPost,
  removeForumVote,
  getUserForumVote,
  deleteForumComment,
  updateForumPost,
} from '@/lib/gist-api'
import ForumCommentSection from '@/components/ForumCommentSection'
import type { ForumPost, ForumComment } from '@/types/gist'
import type { CommentItem } from '@/components/ForumCommentSection'
import { formatDate, getAuthorColor } from '@/lib/forum'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const postId = id

  const commentId = searchParams.get('comment')
  const requestKey = commentId ? searchParams.toString() : ''

  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const session = getSession()

  const load = useCallback(async () => {
    try {
      const [p, c, v] = await Promise.all([
        fetchForumPost(postId),
        fetchForumComments(postId),
        getUserForumVote(postId),
      ])
      setPost(p)
      setComments(c)
      setMyVote(v)
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { load() }, [load])

  const handleVote = useCallback(async (type: 'up' | 'down') => {
    if (!session) return alert('请先登录')
    if (myVote === type) {
      await removeForumVote(postId)
      setMyVote(null)
    } else {
      await voteForumPost(postId, type)
      setMyVote(type)
    }
    const p = await fetchForumPost(postId)
    if (p) setPost(p)
  }, [session, myVote, postId])

  const handleComment = useCallback(async (content: string, parentId?: string) => {
    if (!session || !content.trim()) return
    await addForumComment(postId, content, parentId)
    const [p, c] = await Promise.all([
      fetchForumPost(postId),
      fetchForumComments(postId),
    ])
    if (p) setPost(p)
    setComments(c)
    window.dispatchEvent(new CustomEvent('new-notification'))
  }, [session, postId])

  const handleDeleteComment = useCallback(async (commentId_: string) => {
    try {
      await deleteForumComment(commentId_)
      const [p, c] = await Promise.all([
        fetchForumPost(postId),
        fetchForumComments(postId),
      ])
      if (p) setPost(p)
      setComments(c)
    } catch (e: any) {
      alert(e?.message || '删除失败')
    }
  }, [postId])

  const startEditing = useCallback(() => {
    if (!post) return
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditing(true)
  }, [post])

  const cancelEditing = useCallback(() => {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editTitle.trim() || !editContent.trim()) return
    setSaving(true)
    try {
      await updateForumPost(postId, editTitle, editContent)
      const p = await fetchForumPost(postId)
      if (p) setPost(p)
      setEditing(false)
    } catch (e: any) {
      alert(e?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }, [postId, editTitle, editContent])

  const isAuthor = session && post && session.userId === post.author_id

  if (loading) return (
    <div className={styles.page}>
      <p className={styles.loading}>加载中&hellip;</p>
    </div>
  )
  if (error) return (
    <div className={styles.page}>
      <p className={styles.error}>❌ {error}</p>
    </div>
  )
  if (!post) return (
    <div className={styles.page}>
      <p className={styles.error}>❌ 帖子不存在</p>
    </div>
  )

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
                <button className={styles.backBtnIcon} onClick={startEditing} title="编辑帖子">
                  <FaIcon name="pen" />
                </button>
              )}
              <button className={styles.backBtnIcon} onClick={editing ? cancelEditing : () => router.push('/forum')} title={editing ? '取消编辑' : '返回讨论区'}>
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
          <div className={styles.detailMeta}>
            <span className={`${styles.detailAuthor} ${getAuthorColor(post.author_color, post.author_username, styles as any)}`}>
              {post.author_username}
            </span>
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
            <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
              <MarkdownEditor
                value={editContent}
                onChange={setEditContent}
                className={styles.editorNoBorder}
              />
            </div>
            <div className={styles.formActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEditing}>
                取消
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={saveEdit}
                disabled={saving || !editTitle.trim() || !editContent.trim()}
              >
                {saving ? '保存中&hellip;' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.detail}>
            <div className={styles.detailBody}>
              <WikiContent content={post.content} className="wiki-body" />
            </div>

            <div className={styles.voteBar}>
              <button
                className={`${styles.voteIcon} ${myVote === 'up' ? styles.voteIconActiveUp : ''}`}
                onClick={() => handleVote('up')} title="赞"
              >
                <FaIcon name="thumbs-up" />
              </button>
              <span className={`${styles.voteCount} ${post.upvotes > 0 ? styles.voteCountPositive : ''}`}>
                {post.upvotes}
              </span>
              <button
                className={`${styles.voteIcon} ${myVote === 'down' ? styles.voteIconActiveDown : ''}`}
                onClick={() => handleVote('down')} title="踩"
              >
                <FaIcon name="thumbs-down" />
              </button>
              <span className={`${styles.voteCount} ${post.downvotes > 0 ? styles.voteCountNegative : ''}`}>
                {post.downvotes}
              </span>
            </div>

            <h3 className={styles.commentSectionTitle}>💬 评论</h3>
            <ForumCommentSection
              comments={comments}
              onSubmit={handleComment}
              onDelete={handleDeleteComment}
              targetCommentId={commentId}
              scrollKey={requestKey ? requestKey.length : 0}
            />
          </div>
        )}
      </div>
    </>
  )
}
