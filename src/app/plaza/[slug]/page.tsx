'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient, createClientMd } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import { fetchPlazaArticle, deletePlazaArticle, updatePlazaArticle, fetchAllUsers } from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import VisibilityBar from '@/components/VisibilityBar'
import VisibilityModal from '@/components/VisibilityModal'
import TableOfContents from '@/components/TableOfContents'
import type { UserInfo } from '@/types/gist'
import type { Heading } from '@/lib/content'
import type { PlazaArticleDetail } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import { showWarningToast } from '@/lib/toast'
import { extractHeadingsFromHtml } from '@/lib/plaza-headings'
import styles from '@/styles/plaza.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/* ==============================================================
   文章详情页
   ============================================================== */

export default function PlazaArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  return <PlazaArticleInner />
}

function PlazaArticleInner() {
  const router = useRouter()
  const [slug, setSlug] = useState('')

  // 从 URL 获取 slug
  useEffect(() => {
    const match = window.location.pathname.match(/\/plaza\/([^/]+)/)
    if (match) setSlug(match[1])
  }, [])

  const [article, setArticle] = useState<PlazaArticleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{ userId: string; username: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(true)
  const [editExcludedIds, setEditExcludedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [showVisibilityModal, setShowVisibilityModal] = useState(false)

  useEffect(() => {
    if (!slug) return
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const [a, s] = await Promise.all([
          fetchPlazaArticle(slug),
          getSession(),
        ])
        setArticle(a)
        setSession(s)
        fetchAllUsers().then(setAllUsers).catch(() => {}).finally(() => setUsersLoading(false))
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  useEffect(() => { loadPinyinInitialsFromDB() }, [])

  const isAuthor = session && article && session.userId === article.author_id

  const startEdit = () => {
    if (!article) return
    setEditTitle(article.title)
    setEditContent(article.content)
    setEditIsPublic(article.is_public)
    setEditExcludedIds([])
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
    setEditIsPublic(true)
    setEditExcludedIds([])
  }

  const submitEdit = async () => {
    if (!article || !editTitle.trim() || !editContent.trim() || submitting) return
    setSubmitting(true)
    try {
      await updatePlazaArticle(
        article.id,
        editTitle.trim(),
        editContent.trim(),
        article.category,
        article.sub_category,
        editIsPublic,
      )
      setEditing(false)
      setArticle((prev) => prev ? { ...prev, title: editTitle.trim(), content: editContent.trim(), is_public: editIsPublic } : null)
    } catch (e: any) {
      showWarningToast(e?.message || '编辑失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('确定要删除这篇文章吗？此操作不可撤销。')) return
    try {
      await deletePlazaArticle(article!.id)
      router.push('/plaza')
    } catch (e: any) {
      showWarningToast(e?.message || '删除失败')
    }
  }

  if (!slug) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
  if (loading) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
  if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
  if (!article) return <div className={styles.page}><p className={styles.error}>❌ 文章不存在</p></div>

  // 提取标题用于 TOC（从渲染后的 HTML 提取，保证 ID 与 DOM 一致）
  const articleHtml = article.content
    ? (() => {
        // 临时创建一个 markdown-it 实例来渲染标题
        const md = createClientMd({ highlight: true, texmath: true, anchor: true })
        const raw = md.render(article.content)
        return raw
      })()
    : ''
  const headings: Heading[] = extractHeadingsFromHtml(articleHtml)

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
              <h1
                className={styles.detailTitle}
                dangerouslySetInnerHTML={{ __html: renderClient(article.title) }}
              />
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              {isAuthor && !editing && (
                <>
                  <button className={styles.backBtnIcon} onClick={startEdit} title="编辑文章">
                    <FaIcon name="pen" />
                  </button>
                  <button className={styles.backBtnIcon} onClick={handleDelete} title="删除文章" style={{ color: '#e74c3c' }}>
                    <FaIcon name="times" />
                  </button>
                </>
              )}
              <button className={styles.backBtnIcon} onClick={editing ? cancelEdit : () => router.push('/plaza')} title={editing ? '取消编辑' : '返回列表'}>
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
          <div className={styles.detailMeta}>
            <UserName username={article.author_username} className={styles.author} />
            <span>发布于 {formatDate(article.created_at)}</span>
            {article.updated_at !== article.created_at && (
              <span>更新于 {formatDate(article.updated_at)}</span>
            )}
            <span className={`${styles.badge} ${styles.badgeCategory}`}>{article.category}{article.sub_category ? ` · ${article.sub_category}` : ''}</span>
            {!article.is_public && <span className={`${styles.badge} ${styles.badgePrivate}`}>🔒 私密</span>}
            {editing && <span style={{ color: 'var(--color-primary)' }}>编辑中</span>}
          </div>
        </div>
      </div>

      <div className={styles.detailBody}>
        {editing ? (
          <div className={styles.newArticleForm}>
            {isAuthor && (
              <>
                <div className={styles.formControls}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>可见性</label>
                    <div className={styles.toggleSwitch}>
                      <span>{editIsPublic ? '公开' : '私密'}</span>
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={editIsPublic}
                        onChange={(e) => setEditIsPublic(e.target.checked)}
                      />
                    </div>
                  </div>
                </div>
                {editIsPublic === false && (
                  <VisibilityBar
                    excludedUsers={allUsers.filter((u) => editExcludedIds.includes(u.id))}
                    onOpenModal={() => setShowVisibilityModal(true)}
                    onRemoveExclude={(userId) =>
                      setEditExcludedIds((prev) => prev.filter((id) => id !== userId))
                    }
                  />
                )}
              </>
            )}
            <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
              <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} />
            </div>
            <div className={styles.formActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEdit}>取消</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitEdit} disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        ) : (
          <WikiContent content={article.content} className="wiki-body" />
        )}
      </div>

      {/* TOC — 复用现有 TableOfContents 组件 */}
      <TableOfContents headings={headings} />

      {showVisibilityModal && (
        <VisibilityModal
          allUsers={allUsers}
          usersLoading={usersLoading}
          excludedUserIds={editExcludedIds}
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} 天前`
  return d.toLocaleDateString('zh-CN')
}
