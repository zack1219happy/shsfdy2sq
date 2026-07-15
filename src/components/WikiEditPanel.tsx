'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession, type UserSession } from '@/lib/auth'
import {
  fetchWikiPage,
  fetchUserPendingRevision,
  submitWikiRevision,
  type WikiPage,
} from '@/lib/wiki-api'
import { showWarningToast } from '@/lib/toast'
import styles from '@/styles/wiki-edit.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

interface Props {
  /** wiki 页面的 slug */
  slug: string
  /** 静态编译时的 Markdown 原文（做 fallback，DB 还没内容时用） */
  staticRawContent?: string
  /** 静态编译时的标题 */
  staticTitle?: string
}

export default function WikiEditPanel({ slug, staticRawContent, staticTitle }: Props) {
  const [session, setSession] = useState<UserSession | null>(null)
  const [wikiPage, setWikiPage] = useState<WikiPage | null>(null)
  const [pending, setPending] = useState<{ id: string; title: string; content: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    setSession(getSession())
  }, [])

  // 加载 DB 中的页面 + 用户的 pending
  useEffect(() => {
    if (!slug) return
    ;(async () => {
      try {
        const [page, pend] = await Promise.all([
          fetchWikiPage(slug),
          fetchUserPendingRevision(slug).catch(() => null),
        ])
        if (page) setWikiPage(page)
        if (pend) setPending(pend)
      } catch {
        // DB 还没内容（没迁移），用静态内容
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  // 开始编辑
  const startEdit = useCallback(() => {
    // 优先用 DB 内容，fallback 到静态内容
    const content = pending?.content ?? wikiPage?.content ?? staticRawContent ?? ''
    const title = pending?.title ?? wikiPage?.title ?? staticTitle ?? ''
    setEditContent(content)
    setEditTitle(title)
    setEditing(true)
  }, [pending, wikiPage, staticRawContent, staticTitle])

  // 取消编辑
  const cancelEdit = useCallback(() => {
    setEditing(false)
    setEditContent('')
    setEditTitle('')
  }, [])

  // 提交编辑
  const handleSubmit = useCallback(async () => {
    if (!editTitle.trim() || !editContent.trim() || submitting) return
    setSubmitting(true)
    try {
      await submitWikiRevision(slug, editTitle.trim(), editContent.trim())
      showWarningToast('编辑已提交审核 ✅')
      setEditing(false)
      // 更新 pending 状态
      setPending({ id: 'temp', title: editTitle.trim(), content: editContent.trim() })
    } catch (e: any) {
      alert('提交失败: ' + (e?.message || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }, [slug, editTitle, editContent, submitting])

  // 没登录或没 slug 不显示
  if (!session || !slug) return null

  return (
    <>
      {/* 右上角按钮 */}
      <div className={styles.editBtnContainer}>
        {pending ? (
          <>
            <span className={styles.pendingBadge} title={`提交于 ${formatTime(pending.created_at ?? '')}`}>
              <FaIcon name="spinner" /> 待审核
            </span>
            {editing ? null : (
              <button className={styles.editBtn} onClick={startEdit} title="继续编辑">
                <FaIcon name="pen" />
              </button>
            )}
          </>
        ) : null}
        {!editing && (
          <button className={styles.editBtn} onClick={startEdit} title="编辑此页面">
            <FaIcon name="pen" />
          </button>
        )}
      </div>

      {/* 编辑面板 */}
      {editing && (
        <div className={styles.editPanel}>
          <div className={styles.editPanelHeader}>
            <span>
              <FaIcon name="pen" /> 编辑「{wikiPage?.title ?? staticTitle ?? slug}」
              {pending ? '（已有待审核，将覆盖）' : ''}
            </span>
            <div className={styles.editPanelActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEdit}>
                取消
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSubmit}
                disabled={submitting || !editTitle.trim() || !editContent.trim()}
              >
                {submitting ? '提交中…' : '提交审核'}
              </button>
            </div>
          </div>
          <div className={styles.editPanelBody}>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="页面标题"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: 'none',
                borderBottom: '1px solid var(--color-border)',
                fontSize: '0.95rem',
                outline: 'none',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
            <MarkdownEditor value={editContent} onChange={setEditContent} />
          </div>
        </div>
      )}
    </>
  )
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  return `${Math.floor(hrs / 24)} 天前`
}
