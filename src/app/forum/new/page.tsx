'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { createForumPost, fetchAllUsers } from '@/lib/gist-api'
import { UserName } from '@/components/UserName'
import type { UserInfo } from '@/types/gist'
import { getPinyinInitials } from '@/lib/people'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function NewPostPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = getSession()

  // 可见性状态
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [excludedUserIds, setExcludedUserIds] = useState<string[]>([])
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  // 加载用户列表
  useEffect(() => {
    fetchAllUsers()
      .then((users) => setAllUsers(users))
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }, [])

  /** 从 excludedUserIds 反查 UserInfo */
  const excludedUsers = useMemo(
    () => allUsers.filter((u) => excludedUserIds.includes(u.id)),
    [allUsers, excludedUserIds],
  )

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return
    setSubmitting(true)
    setError(null)
    try {
      const id = await createForumPost(title, content, excludedUserIds)
      router.push('/forum/post?id=' + id)
    } catch (e: any) {
      setError(e?.message || '发帖失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, router, excludedUserIds])

  /** 在模态框中切换某个用户是否被排除 */
  const toggleExclude = useCallback((userId: string) => {
    setExcludedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }, [])

  if (!session) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>请先登录后再发帖</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2><FaIcon name="pen" /> 发新帖</h2>
        <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => router.push('/forum')}>
          ← 返回
        </button>
      </div>

      <div className={styles.newPostForm}>
        <input
          className={styles.titleInput}
          type="text"
          placeholder="帖子标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />

        {/* ===== 可见性标签栏 ===== */}
        <VisibilityBar
          excludedUsers={excludedUsers}
          allUsers={allUsers}
          onOpenModal={() => setShowVisibilityModal(true)}
          onRemoveExclude={(userId) =>
            setExcludedUserIds((prev) => prev.filter((id) => id !== userId))
          }
        />

        <div className={styles.editorWrapper}>
          <MarkdownEditor value={content} onChange={setContent} className={styles.editorNoBorder} />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.formActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => router.push('/forum')}>
            取消
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '发布中…' : '发布帖子'}
          </button>
        </div>
      </div>

      {/* ===== 可见性选择模态框 ===== */}
      {showVisibilityModal && (
        <VisibilityModal
          allUsers={allUsers}
          usersLoading={usersLoading}
          excludedUserIds={excludedUserIds}
          onToggle={toggleExclude}
          onClose={() => setShowVisibilityModal(false)}
        />
      )}
    </div>
  )
}

/* ==============================================================
   VisibilityBar — 可见性标签栏
   ============================================================== */

function VisibilityBar({
  excludedUsers,
  allUsers,
  onOpenModal,
  onRemoveExclude,
}: {
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

/* ==============================================================
   VisibilityModal — 可见性选择模态框
   ============================================================== */

function VisibilityModal({
  allUsers,
  usersLoading,
  excludedUserIds,
  onToggle,
  onClose,
}: {
  allUsers: UserInfo[]
  usersLoading?: boolean
  excludedUserIds: string[]
  onToggle: (userId: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          !search.trim() ||
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          getPinyinInitials(u.name).toLowerCase().includes(search.toLowerCase()),
      ),
    [allUsers, search],
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.visibilityModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.visibilityModalHeader}>
          <h3>选择不可见用户</h3>
          <button type="button" className={styles.visibilityModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.visibilityModalSearch}>
          <input
            type="text"
            placeholder="搜索姓名或用户名…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.visibilityModalList}>
          {usersLoading ? (
            <p className={styles.visibilityModalEmpty}>加载中…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.visibilityModalEmpty}>无匹配用户</p>
          ) : (
            <>
              {filtered.map((u) => {
                const excluded = excludedUserIds.includes(u.id)
                return (
                  <label key={u.id} className={styles.visibilityModalItem}>
                    <span className={styles.visibilityModalName}>
                      <span className={styles.visibilityModalInitials}>{getPinyinInitials(u.name)}</span>
                      <span className={styles.visibilityModalUsername}>@<UserName username={u.username} /></span>
                    </span>
                    <div
                      className={`${styles.toggleSwitch} ${excluded ? styles.toggleOn : ''}`}
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
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

