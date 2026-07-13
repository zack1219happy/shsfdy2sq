'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { createPlazaArticle } from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import { PLAZA_CATEGORIES } from '@/types/plaza'
import type { PlazaCategory } from '@/types/plaza'
import Styles from '@/styles/forum.module.css'

/* ==============================================================
   发表文章页
   - 默认私密、分类默认"学习笔记"、子类默认"其他"
   - 分类和可见性分两行，可见性用论坛 toggleSwitch 控件
   - 复用论坛样式（forum.module.css）
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
  const [category, setCategory] = useState<PlazaCategory>('学习笔记')
  const [subCategory, setSubCategory] = useState<string | null>('其他') // 默认选"其他"
  const [isPublic, setIsPublic] = useState(false) // 默认私密
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const session = getSession()

  useEffect(() => { loadPinyinInitialsFromDB() }, [])

  // 当前分类的子类列表（仅非 null）
  const currentSubs = useMemo(() => {
    const cat = PLAZA_CATEGORIES.find((c) => c.name === category)
    return ((cat?.subCategories ?? []) as readonly (string | null)[]).filter((s): s is string => s !== null)
  }, [category])

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return
    setSubmitting(true)
    setError(null)
    try {
      const slug =
        title
          .trim()
          .toLowerCase()
          .replace(/[^\w一-鿿-]+/g, '-')
          .replace(/^-+|-+$/g, '') +
        '-' +
        Date.now().toString(36)
      await createPlazaArticle(title.trim(), slug, content.trim(), category, subCategory, isPublic)
      router.push('/plaza/post?slug=' + encodeURIComponent(slug))
    } catch (e: any) {
      setError(e?.message || '发布失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, category, subCategory, isPublic, router])

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

        {/* 分类 —— 第一行 */}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>分类</label>
            <select
              style={{
                padding: '6px 10px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--border-radius)',
                fontSize: '0.9rem',
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
              value={category}
              onChange={(e) => {
                const newCat = e.target.value as PlazaCategory
                setCategory(newCat)
                // 切换到新分类时，子类默认选该分类第一个（如有），否则 null
                const subs = (PLAZA_CATEGORIES.find((c) => c.name === newCat)?.subCategories ?? []) as readonly (string | null)[]
                const first = subs.find((s): s is string => s !== null) ?? null
                setSubCategory(first)
              }}
            >
              {PLAZA_CATEGORIES.map((cat) => (
                <option key={cat.name} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* 子类（仅当有多个时显示，无"不限"选项） */}
          {currentSubs.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>子类</label>
              <select
                style={{
                  padding: '6px 10px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '0.9rem',
                  color: 'var(--color-text)',
                  background: 'var(--color-bg)',
                  outline: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
                value={subCategory || ''}
                onChange={(e) => setSubCategory(e.target.value || null)}
              >
                {currentSubs.map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 可见性 —— 第二行 */}
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
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '发布中…' : '发布文章'}
          </button>
        </div>
      </div>
    </div>
  )
}
