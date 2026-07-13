'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { createPlazaArticle, fetchAllUsers } from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import VisibilityBar from '@/components/VisibilityBar'
import VisibilityModal from '@/components/VisibilityModal'
import type { UserInfo } from '@/types/gist'
import { PLAZA_CATEGORIES } from '@/types/plaza'
import type { PlazaCategory } from '@/types/plaza'
import Styles from '@/styles/plaza.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function NewArticlePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<PlazaCategory>('学习笔记')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = getSession()

  // 可见性状态
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [excludedUserIds, setExcludedUserIds] = useState<string[]>([])
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  useEffect(() => {
    loadPinyinInitialsFromDB()
    fetchAllUsers()
      .then((users) => setAllUsers(users))
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }, [])

  const excludedUsers = useMemo(
    () => allUsers.filter((u) => excludedUserIds.includes(u.id)),
    [allUsers, excludedUserIds],
  )

  // 当前分类的子类列表
  const currentCat = useMemo(
    () => PLAZA_CATEGORIES.find((c) => c.name === category),
    [category],
  )

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return
    setSubmitting(true)
    setError(null)
    try {
      const slug = title.trim().toLowerCase().replace(/[^\w一-鿿-]+/g, '-').replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36)
      const id = await createPlazaArticle(
        title.trim(),
        slug,
        content.trim(),
        category,
        subCategory,
        isPublic,
      )
      router.push('/plaza/' + slug)
    } catch (e: any) {
      setError(e?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, category, subCategory, isPublic, router])

  const toggleExclude = useCallback((userId: string) => {
    setExcludedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }, [])

  if (!session) {
    return (
      <div className={Styles.page}>
        <p className={Styles.error}>请先登录后再发文章</p>
      </div>
    )
  }

  return (
    <div className={Styles.page}>
      <div className={Styles.header}>
        <h2><FaIcon name="pen" /> 发表文章</h2>
        <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => router.push('/plaza')}>
          ← 返回
        </button>
      </div>

      <div className={Styles.newArticleForm}>
        <input
          className={Styles.titleInput}
          type="text"
          placeholder="文章标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />

        {/* 分类选择 */}
        <div className={Styles.formControls}>
          <div className={Styles.formGroup}>
            <label className={Styles.formLabel}>分类</label>
            <select
              className={Styles.formSelect}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as PlazaCategory)
                setSubCategory(null)
              }}
            >
              {PLAZA_CATEGORIES.map((cat) => (
                <option key={cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {currentCat && currentCat.subCategories.length > 1 && (
            <div className={Styles.formGroup}>
              <label className={Styles.formLabel}>子类</label>
              <select
                className={Styles.formSelect}
                value={subCategory || ''}
                onChange={(e) => setSubCategory(e.target.value || null)}
              >
                <option value="">不限</option>
                {currentCat.subCategories.map((sub) => (
                  sub !== null && <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}

          <div className={Styles.formGroup}>
            <label className={Styles.formLabel}>可见性</label>
            <div className={Styles.toggleSwitch}>
              <span>{isPublic ? '公开' : '私密'}</span>
              <input
                type="checkbox"
                className={Styles.toggleInput}
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
            </div>
          </div>
        </div>

        {isPublic === false && (
          <VisibilityBar
            excludedUsers={excludedUsers}
            onOpenModal={() => setShowVisibilityModal(true)}
            onRemoveExclude={(userId) =>
              setExcludedUserIds((prev) => prev.filter((id) => id !== userId))
            }
          />
        )}

        <div className={Styles.editorWrapper}>
          <MarkdownEditor value={content} onChange={setContent} className={Styles.editorNoBorder} />
        </div>

        {error && <p className={Styles.error}>{error}</p>}

        <div className={Styles.formActions}>
          <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => router.push('/plaza')}>
            取消
          </button>
          <button
            className={`${Styles.btn} ${Styles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '发布中…' : '发布文章'}
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
