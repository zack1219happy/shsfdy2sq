'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import CategoryPickerModal from '@/components/CategoryPickerModal'
import { getSession } from '@/lib/auth'
import { createPlazaArticle, fetchPlazaCategories } from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import { useAutoSave, loadDraft } from '@/hooks/useAutoSave'
import type { PlazaCategory } from '@/types/plaza'
import Styles from '@/styles/forum.module.css'

/* ==============================================================
   发表文章页
   - 默认私密、可见性用论坛 toggleSwitch 控件
   - 分类通过 CategoryPickerModal 从数据库分类树中选择
   ============================================================== */

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function NewArticlePage() {
  const router = useRouter()

  // 表单字段
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null) // 用户选的分类 ID
  const [categoryName, setCategoryName] = useState<string | null>(null) // 用户选的分类名（用于显示）
  const [isPublic, setIsPublic] = useState(false) // 默认私密
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<PlazaCategory[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const session = getSession()

  useEffect(() => { loadPinyinInitialsFromDB() }, [])

  // 加载分类
  useEffect(() => {
    fetchPlazaCategories()
      .then(setCategories)
      .catch(() => {})
  }, [])

  // 恢复草稿
  useEffect(() => {
    interface DraftData {
      title: string
      content: string
      categoryId: string | null
      categoryName: string | null
      isPublic: boolean
    }
    const draft = loadDraft<DraftData>('plaza_new')
    if (draft) {
      if (draft.title) setTitle(draft.title)
      if (draft.content) setContent(draft.content)
      if (draft.categoryId) setCategoryId(draft.categoryId)
      if (draft.categoryName) setCategoryName(draft.categoryName)
      if (draft.isPublic !== undefined) setIsPublic(draft.isPublic)
    }
  }, [])

  // 自动保存草稿
  const hasContent = title.trim() !== '' || content.trim() !== ''
  const { clearDraft } = useAutoSave({
    key: 'plaza_new',
    data: { title, content, categoryId, categoryName, isPublic },
    enabled: hasContent,
  })

  // 分类显示文本
  const categoryLabel = useMemo(() => {
    if (!categoryName) return null
    // 找到该分类节点及其父节点，显示完整路径
    const cat = categories.find((c) => c.name === categoryName)
    if (!cat) return categoryName
    const parts: string[] = [cat.name]
    let parentId = cat.parent_id
    while (parentId) {
      const parent = categories.find((c) => c.id === parentId)
      if (!parent) break
      parts.unshift(parent.name)
      parentId = parent.parent_id
    }
    return parts.join(' · ')
  }, [categoryName, categories])

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session || !categoryId) return
    setSubmitting(true)
    setError(null)
    try {
      // 从分类 ID 直接使用
      const cat = categories.find((c) => c.id === categoryId)
      if (!cat) { setError('无效的分类'); return }

      const slug =
        title
          .trim()
          .toLowerCase()
          .replace(/[^\w一-鿿-]+/g, '-')
          .replace(/^-+|-+$/g, '') +
        '-' +
        Date.now().toString(36)
      await createPlazaArticle(title.trim(), slug, content.trim(), categoryId, isPublic)
      clearDraft()
      router.push('/plaza/post?slug=' + encodeURIComponent(slug))
    } catch (e: any) {
      setError(e?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, categoryId, categories, isPublic, router])

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
        <h2>
          <FaIcon name="pen" /> 发表文章
        </h2>
        <button className={`${Styles.btn} ${Styles.btnOutline}`} onClick={() => router.push('/plaza')}>
          ← 返回
        </button>
      </div>

      <div className={Styles.newPostForm}>
        <input
          className={Styles.titleInput}
          type="text"
          placeholder="文章标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />

        {/* 分类选择器 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>分类</label>
          <button
            type="button"
            className={Styles.catPickerTrigger}
            onClick={() => setPickerOpen(true)}
          >
            <FaIcon name="folder" className={Styles.catPickerTriggerIcon} />
            <span className={`${Styles.catPickerTriggerText} ${!categoryLabel ? Styles.catPickerTriggerPlaceholder : ''}`}>
              {categoryLabel || '选择分类…'}
            </span>
            <FaIcon name="chevron-right" className={Styles.catPickerTriggerChevron} />
          </button>
        </div>

        {/* 可见性 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>可见性</span>
          <div
            className={Styles.toggleSwitch + (isPublic ? ' ' + Styles.toggleOn : '')}
            onClick={() => setIsPublic(!isPublic)}
            role="switch"
            aria-checked={isPublic}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsPublic(!isPublic) } }}
          >
            <div className={Styles.toggleSlider} />
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            {isPublic ? '公开（所有人可见）' : '私密（仅自己可见）'}
          </span>
        </div>

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
            disabled={submitting || !title.trim() || !content.trim() || !categoryId}
          >
            {submitting ? '发布中…' : '发布文章'}
          </button>
        </div>
      </div>

      {/* 分类选择模态框 */}
      {pickerOpen && (
        <CategoryPickerModal
          categories={categories}
          selectedName={categoryName}
          onConfirm={(id, name) => { setCategoryId(id); setCategoryName(name) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
