'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { createForumPost } from '@/lib/gist-api'
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

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !content.trim() || !session) return
    setSubmitting(true)
    setError(null)
    try {
      const id = await createForumPost(title, content)
      router.push('/forum/post?id=' + id)
    } catch (e: any) {
      setError(e?.message || '发帖失败')
    } finally {
      setSubmitting(false)
    }
  }, [title, content, session, router])

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
    </div>
  )
}
