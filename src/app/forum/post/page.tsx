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
  voteForumPost,
  removeForumVote,
  getUserForumVote,
  updateForumPost,
  fetchAllUsers,
} from '@/lib/gist-api'
import ForumCommentSection from '@/components/ForumCommentSection'
import type { ForumPost, ForumComment, UserInfo } from '@/types/gist'
import { formatDate, getAuthorColor } from '@/lib/forum'
import { registry } from '@/data/person-registry'
import styles from '@/styles/forum.module.css'

/** 从 person-registry 查找姓名对应的拼音首字母缩写 */
const _initialsMap = new Map<string, string>()
for (const e of registry.students) _initialsMap.set(e.name, e.initials)
for (const e of registry.teachers) _initialsMap.set(e.name, e.initials)
function getPinyinInitials(name: string): string {
  return _initialsMap.get(name) ?? ''
}

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
  const [submitting, setSubmitting] = useState(false)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

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

  useEffect(() => { load() }, [load])

  const handleVote = async (type: 'up' | 'down') => {
    if (!post) return
    try {
      if (myVote === type) {
        await removeForumVote(post.id)
        setMyVote(null)
      } else {
        await voteForumPost(post.id, type)
        setMyVote(type)
      }
      load()
    } catch {}
  }

  const startEdit = () => {
    if (!post) return
    setEditTitle(post.title)
    setEditContent(post.content)
    setEditExcludedIds(post.excluded_visibility ?? [])
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
    setEditExcludedIds([])
  }

  const submitEdit = async () => {
    if (!post || !editTitle.trim() || !editContent.trim() || submitting) return
    setSubmitting(true)
    try {
      await updateForumPost(post.id, editTitle.trim(), editContent.trim(), editExcludedIds)
      setEditing(false)
      load()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  const handleNewComment = async (content: string, parentId?: string) => {
    try {
      await addForumComment(postId, content, parentId)
      load()
    } catch (e: any) { setError(e.message) }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const { deleteForumComment } = await import('@/lib/gist-api')
      await deleteForumComment(commentId)
      load()
    } catch (e: any) { setError(e.message) }
  }

  const isAuthor = session && post && session.userId === post.author_id
  const editExcludedUsers = allUsers.filter((u) => editExcludedIds.includes(u.id))

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
            <VisibilityBar
              excludedUsers={editExcludedUsers}
              allUsers={allUsers}
              onOpenModal={() => setShowVisibilityModal(true)}
              onRemoveExclude={(userId) =>
                setEditExcludedIds((prev) => prev.filter((id) => id !== userId))
              }
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

            <h3 className={styles.commentSectionTitle}>💬 评论</h3>
            <ForumCommentSection
              comments={comments}
              onSubmit={handleNewComment}
              onDelete={handleDeleteComment}
              targetCommentId={commentId}
              scrollKey={requestKey ? requestKey.length : 0}
            />
          </div>
        )}
      </div>

      {showVisibilityModal && (
        <VisibilityModal
          allUsers={allUsers}
          usersLoading={usersLoading}
          excludedIds={editExcludedIds}
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

function VisibilityBar({ excludedUsers, allUsers, onOpenModal, onRemoveExclude }: {
  excludedUsers: UserInfo[]
  allUsers: UserInfo[]
  onOpenModal: () => void
  onRemoveExclude: (userId: string) => void
}) {
  return (
    <div className={styles.visibilityBar}>
      <span className={styles.visibilityLabel}>可见性</span>
      <div className={styles.visibilityTags}>
        {excludedUsers.length === 0 ? (
          <span className={styles.visibilityTagAll}>所有人可见</span>
        ) : (
          excludedUsers.map((u) => (
            <span key={u.id} className={styles.visibilityTag}>
              隐藏: {u.name || u.username}
              <button
                type="button"
                className={styles.visibilityTagRemove}
                onClick={() => onRemoveExclude(u.id)}
                title="移除此人"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>
      <button
        type="button"
        className={styles.visibilityAddBtn}
        onClick={onOpenModal}
        title="设置可见性"
      >
        + 标签
      </button>
    </div>
  )
}

function VisibilityModal({ allUsers, usersLoading, excludedIds, onToggle, onClose }: {
  allUsers: UserInfo[]
  usersLoading?: boolean
  excludedIds: string[]
  onToggle: (userId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = allUsers.filter(
    (u) =>
      !search.trim() ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      getPinyinInitials(u.name).toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.visibilityModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.visibilityModalHeader}>
          <h3>选择不可见用户</h3>
          <button className={styles.visibilityModalClose} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.visibilityModalSearch}>
          <input
            type="text"
            placeholder="搜索用户…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.visibilityModalList}>
          {usersLoading ? (
            <div className={styles.visibilityModalEmpty}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.visibilityModalEmpty}>没有匹配的用户</div>
          ) : (
            <>
              {filtered.map((u) => {
                const selected = excludedIds.includes(u.id)
                return (
                  <label key={u.id} className={styles.visibilityModalItem}>
                    <span className={styles.visibilityModalName}>
                      <span className={styles.visibilityModalInitials}>{getPinyinInitials(u.name)}</span>
                      <span className={styles.visibilityModalUsername}>@{u.username}</span>
                    </span>
                    <div
                      className={`${styles.toggleSwitch} ${selected ? styles.toggleOn : ''}`}
                      onClick={() => onToggle(u.id)}
                    >
                      <div className={styles.toggleSlider} />
                    </div>
                  </label>
                )
              })}
            </>
          )}
        </div>
        <div className={styles.visibilityModalFooter}>
          <span className={styles.visibilityModalHint}>
            开启开关 = 该用户<strong>不可见</strong>此帖子
          </span>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
