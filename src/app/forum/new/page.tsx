'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { createForumPost, fetchAllUsers, checkForumDuplicate } from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import VisibilityBar from '@/components/VisibilityBar'
import VisibilityModal from '@/components/VisibilityModal'
import { useAutoSave, loadDraft } from '@/hooks/useAutoSave'
import type { UserInfo } from '@/types/gist'
import Styles from '@/styles/forum.module.css'

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
  const [dupWarning, setDupWarning] = useState<{ existing_title: string; created_at: string } | null>(null)
  const session = getSession()

  // 可见性状态
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [excludedUserIds, setExcludedUserIds] = useState<string[]>([])
  const [agentVisible, setAgentVisible] = useState(true)
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  // 加载用户列表 + 拼音首字母
  useEffect(() => {
    loadPinyinInitialsFromDB()
    fetchAllUsers()
      .then((users) => setAllUsers(users))
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }, [])

  // 恢复草稿
  useEffect(() => {
    interface DraftData {
      title: string
      content: string
      excludedUserIds: string[]
    }
    const draft = loadDraft<DraftData>('forum_new')
    if (draft) {
      if (draft.title) setTitle(draft.title)
      if (draft.content) setContent(draft.content)
      if (draft.excludedUserIds) setExcludedUserIds(draft.excludedUserIds)
    if ('agentVisible' in draft) setAgentVisible((draft as any).agentVisible)
    }
  }, [])

  // 自动保存草稿
  const hasContent = title.trim() !== '' || content.trim() !== ''
  const { clearDraft } = useAutoSave({
    key: 'forum_new',
    data: { title, content, excludedUserIds, agentVisible },
    enabled: hasContent,
  })

  /** 从 excludedUserIds 反查 UserInfo */
  const excludedUsers = useMemo(
    () => allUsers.filter((u) => excludedUserIds.includes(u.id)),
    [allUsers, excludedUserIds],
  )

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return

    // 预检重复
    const dup = await checkForumDuplicate(title.trim(), content.trim())
    if (dup) {
      setDupWarning({ existing_title: dup.existing_title, created_at: dup.created_at })
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const id = await createForumPost(title.trim(), content.trim(), excludedUserIds, agentVisible)
      clearDraft()
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

  /** 忽略重复警告，强制发布 */
  const handleForceSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return
    setDupWarning(null)
    setSubmitting(true)
    setError(null)
    try {
      const id = await createForumPost(title.trim(), content.trim(), excludedUserIds, agentVisible)
      clearDraft()
      router.push('/forum/post?id=' + id)
    } catch (e: any) {
      setError(e?.message || '发帖失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, router, excludedUserIds])

  if (!session) {
    return (
      <div className={Styles.page}>
        <p className={Styles.error}>请先登录后再发帖</p>
      </div>
    )
  }

  return (
    <div className={Styles.page}>
      <div className={Styles.header}>
        <h2><FaIcon name="pen" /> 发新帖</h2>
        <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => router.push('/forum')}>
          ← 返回
        </button>
      </div>

      <div className={Styles.newPostForm}>
        <input
          className={Styles.titleInput}
          type="text"
          placeholder="帖子标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />

        <VisibilityBar
          excludedUsers={excludedUsers}
          onOpenModal={() => setShowVisibilityModal(true)}
          onRemoveExclude={(userId) =>
            setExcludedUserIds((prev) => prev.filter((id) => id !== userId))
          }
          agentVisible={agentVisible}
          onAgentVisibleChange={setAgentVisible}
        />

        <div className={Styles.editorWrapper}>
          <MarkdownEditor value={content} onChange={setContent} className={Styles.editorNoBorder} />
        </div>

        {error && <p className={Styles.error}>{error}</p>}

        {/* 重复内容警告 */}
        {dupWarning && (
          <div className={Styles.dupWarning}>
            <div className={Styles.dupWarningContent}>
              <p><strong>检测到重复内容</strong></p>
              <p>您已在 {new Date(dupWarning.created_at).toLocaleString('zh-CN')} 发过标题为「{dupWarning.existing_title}」的帖子，内容相似。</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>确认再次发布吗？</p>
              <div className={Styles.dupWarningActions}>
                <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => setDupWarning(null)}>
                  不发布了
                </button>
                <button className={`${Styles.btn} ${Styles.btnPrimary}`} onClick={handleForceSubmit}>
                  确认发布
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={Styles.formActions}>
          <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => router.push('/forum')}>
            取消
          </button>
          <button
            className={`${Styles.btn} ${Styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '发布中…' : '发布帖子'}
          </button>
        </div>
      </div>

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