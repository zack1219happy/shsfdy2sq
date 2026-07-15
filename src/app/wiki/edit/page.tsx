'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { fetchWikiPage, fetchUserPendingRevision, submitWikiRevision } from '@/lib/wiki-api'
import { showWarningToast } from '@/lib/toast'
import styles from '@/styles/wiki-edit.module.css'
import forumStyles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function WikiEditPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [session, setSession] = useState(getSession())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) { setLoading(false); return }
    ;(async () => {
      try {
        // 尝试从 DB 加载，fallback 到静态内容
        const [dbPage, pending] = await Promise.all([
          fetchWikiPage(slug).catch(() => null),
          fetchUserPendingRevision(slug).catch(() => null),
        ])
        if (pending) {
          // 有 pending，用 pending 的内容继续编辑
          setTitle(pending.title)
          setContent(pending.content)
        } else if (dbPage) {
          setTitle(dbPage.title)
          setContent(dbPage.content)
        } else {
          setError('页面不存在')
        }
      } catch (e: any) {
        setError(e?.message || '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  const handleSubmit = useCallback(async () => {
    if (!slug || !title.trim() || !content.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitWikiRevision(slug, title.trim(), content.trim())
      showWarningToast('编辑已提交审核 ✅')
      router.push(`/wiki/${slug}`)
    } catch (e: any) {
      setError(e?.message || '提交失败')
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
            onClick={() => router.push(`/wiki/${slug}`)}
          >
            ← 返回
          </button>
          <button
            className={`${forumStyles.btn} ${forumStyles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
          >
            {submitting ? '提交中…' : '提交审核'}
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
