'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession, tryRestoreSessionFromAuth } from '@/lib/auth'
import { fetchAgreementPage, updateAgreementPage } from '@/lib/agreement-api'
import { showWarningToast } from '@/lib/toast'
import styles from '@/styles/wiki-edit.module.css'
import forumStyles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function AgreementEditPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [session, setSession] = useState(getSession())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    tryRestoreSessionFromAuth().then(() => {
      const s = getSession()
      setSession(s)
      if (!s || !['admin', 'super_admin'].includes(s.role)) {
        setError('无权限')
        setLoading(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!slug || !isAdmin) { setLoading(false); return }
    ;(async () => {
      try {
        const page = await fetchAgreementPage(slug)
        if (page) {
          setTitle(page.title)
          setContent(page.content)
        } else {
          setError('页面不存在')
        }
      } catch (e: any) {
        setError(e?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [slug, isAdmin])

  const handleSave = useCallback(async () => {
    if (!slug || !title.trim() || !content.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await updateAgreementPage(slug, title.trim(), content.trim())
      showWarningToast('已保存 ✅')
      router.push(`/agreement/${slug}`)
    } catch (e: any) {
      setError(e?.message || '保存失败')
    } finally {
      setSubmitting(false)
    }
  }, [slug, title, content, submitting, router])

  if (!session) {
    return (
      <div className={styles.editPage}>
        <p className={styles.editLoading}>请先登录</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className={styles.editPage}>
        <p className={styles.editLoading}>仅管理员可编辑</p>
      </div>
    )
  }

  if (!slug) {
    return (
      <div className={styles.editPage}>
        <p className={styles.editLoading}>缺少页面标识</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.editPage}>
        <p className={styles.editLoading}>加载中…</p>
      </div>
    )
  }

  return (
    <div className={styles.editPage}>
      <div className={styles.editHeader}>
        <h2>
          <FaIcon name="pen" /> 编辑页面
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`${forumStyles.btn} ${forumStyles.btnOutline}`}
            onClick={() => router.push(`/agreement/${slug}`)}
          >
            ← 返回
          </button>
          <button
            className={`${forumStyles.btn} ${forumStyles.btnPrimary}`}
            onClick={handleSave}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {error && <div className={styles.editError}>❌ {error}</div>}

      <div className={forumStyles.newPostForm}>
        <input
          className={forumStyles.titleInput}
          type="text"
          placeholder="页面标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          autoFocus
        />
        <div className={forumStyles.editorWrapper}>
          <MarkdownEditor value={content} onChange={setContent} className={forumStyles.editorNoBorder} />
        </div>
      </div>
    </div>
  )
}
