'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { getSession } from '@/lib/auth'
import {
  fetchForumPost,
  fetchForumComments,
  addForumComment,
  voteForumPost,
  removeForumVote,
  getUserForumVote,
  updateForumPost,
} from '@/lib/gist-api'
import ForumCommentSection from '@/components/ForumCommentSection'
import type { ForumPost, ForumComment } from '@/types/gist'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function ForumPostPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const postId = searchParams.get('id') || ''

  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{ userId: string; username: string } | null>(null)
  const [userVote, setUserVote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showReplyEditor, setShowReplyEditor] = useState(false)

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
      setUserVote(v)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [postId])

  useEffect(() => { load() }, [load])

  const handleVote = async (type: 'up' | 'down') => {
    if (!post) return
    try {
      const was = userVote
      if (was === type) {
        await removeForumVote(post.id)
        setUserVote(null)
      } else {
        await voteForumPost(post.id, type)
        setUserVote(type)
      }
      load()
    } catch {}
  }

  const startEdit = () => {
    if (!post) return
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditing(true)
  }

  const submitEdit = async () => {
    if (!post || !editTitle.trim() || !editContent.trim() || submitting) return
    setSubmitting(true)
    try {
      await updateForumPost(post.id, editTitle.trim(), editContent.trim())
      setEditing(false)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  const handleNewComment = async (content: string, parentId?: string) => {
    try {
      await addForumComment(postId, content, parentId)
      setShowReplyEditor(false)
      load()
    } catch (e: any) { setError(e.message) }
  }

  if (!postId) return <div className={styles.pageContainer}><p>缺少帖子 ID</p></div>
  if (loading) return <div className={styles.pageContainer}><p>加载中…</p></div>
  if (error) return <div className={styles.pageContainer}><p className={styles.error}>{error}</p></div>
  if (!post) return <div className={styles.pageContainer}><p>帖子不存在</p></div>

  return (
    <div className={styles.pageContainer}>
      <button className={styles.backBtn} onClick={() => router.push('/forum')}>
        <FaIcon name="fas fa-arrow-left" /> 返回讨论区
      </button>

      {editing ? (
        <div className={styles.editForm}>
          <input className={styles.titleInput} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="标题" maxLength={100} />
          <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} />
          <div className={styles.formActions}>
            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setEditing(false)}>取消</button>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitEdit} disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.postDetail}>
            <h2 className={styles.postTitleDetail}>{post.title}</h2>
            <div className={styles.postMeta}>
              <span className={styles.postAuthor} style={{ color: post.author_color || undefined }}>{post.author_username}</span>
              <span className={styles.postDate}>{new Date(post.created_at).toLocaleString('zh-CN')}</span>
              <span className={styles.postVotes}>
                <button className={`${styles.voteBtn} ${userVote === 'up' ? styles.voted : ''}`}
                  onClick={() => handleVote('up')} title="赞"><FaIcon name="fas fa-thumbs-up" /></button>
                <span className={styles.voteCount}>{post.upvotes ?? 0}</span>
                <button className={`${styles.voteBtn} ${userVote === 'down' ? styles.voted : ''}`}
                  onClick={() => handleVote('down')} title="踩"><FaIcon name="fas fa-thumbs-down" /></button>
                <span className={styles.voteCount}>{post.downvotes ?? 0}</span>
              </span>
            </div>
            <div className="wiki-body">
              <WikiContent format="markdown" content={post.content} />
            </div>
            {session && (post.author_username === session.username || post.author_id === session.userId) && (
              <button className={styles.editBtn} onClick={startEdit}><FaIcon name="fas fa-pen" /> 编辑</button>
            )}
          </div>

          <div className={styles.commentsSection}>
            <h3><FaIcon name="fas fa-comments" /> 评论 ({comments.length})</h3>

            {!showReplyEditor && session && (
              <button className={`${styles.btn} ${styles.btnPrimary} ${styles.replyBtn}`}
                onClick={() => setShowReplyEditor(true)}>写评论</button>
            )}

            {showReplyEditor && (
              <div className={styles.replyEditor}>
                <ForumCommentSection
                  comments={comments}
                  onSubmit={handleNewComment}
                />
              </div>
            )}

            {!showReplyEditor && comments.length > 0 && (
              <ForumCommentSection
                comments={comments}
                onSubmit={handleNewComment}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
