'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import {
  fetchPendingRevisions,
  fetchRevisionDetail,
  approveWikiRevision,
  rejectWikiRevision,
  type WikiRevision,
  type RevisionDetail,
} from '@/lib/wiki-api'
import { lineDiff, type DiffLine } from '@/lib/diff'
import styles from '@/styles/admin.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

export default function AdminRevisionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('id') || ''

  const [session, setSession] = useState(getSession())
  const [revisions, setRevisions] = useState<WikiRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<RevisionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // 管理员可在编辑器中修改内容
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const diffContainerRef = useRef<HTMLDivElement>(null)

  // 权限检查
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  // 加载列表
  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    fetchPendingRevisions()
      .then(setRevisions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isAdmin])

  // 加载详情
  useEffect(() => {
    if (!selectedId || !isAdmin) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    fetchRevisionDetail(selectedId)
      .then((d) => {
        setDetail(d)
        if (d) {
          setEditTitle(d.title)
          setEditContent(d.content)
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedId, isAdmin])

  // 计算 diff
  const diffLines: DiffLine[] = useMemo(() => {
    if (!detail) return []
    return lineDiff(detail.current_content, editContent)
  }, [detail, editContent])

  // 点击 diff 行跳转到编辑器对应位置（近似行号）
  const handleDiffLineClick = useCallback((line: DiffLine) => {
    if (line.type === 'same' && line.newLine != null) {
      // 粗略跳转到对应行：通过 textarea 的行号无法直接跳转，
      // 这里只是标记一个粗略的位置。后续可以优化为 CodeMirror 行跳转。
    }
  }, [])

  // 批准
  const handleApprove = useCallback(async () => {
    if (!detail || submitting) return
    setSubmitting(true)
    try {
      const title = editTitle.trim() || detail.title
      const content = editContent.trim() || detail.content
      await approveWikiRevision(detail.id, { title, content })
      // 刷新列表并返回
      const updated = await fetchPendingRevisions()
      setRevisions(updated)
      setDetail(null)
      setReviewComment('')
      router.replace('/admin/revisions')
    } catch (e: any) {
      alert('批准失败: ' + (e.message || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }, [detail, editTitle, editContent, submitting, router])

  // 驳回
  const handleReject = useCallback(async () => {
    if (!detail || submitting) return
    if (!reviewComment.trim()) {
      if (!confirm('没有填写反馈意见，确定要驳回吗？')) return
    }
    setSubmitting(true)
    try {
      await rejectWikiRevision(detail.id, reviewComment.trim())
      const updated = await fetchPendingRevisions()
      setRevisions(updated)
      setDetail(null)
      setReviewComment('')
      router.replace('/admin/revisions')
    } catch (e: any) {
      alert('驳回失败: ' + (e.message || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }, [detail, reviewComment, submitting, router])

  // 选择一个 revision
  const selectRevision = useCallback((id: string) => {
    setReviewComment('')
    router.replace(`/admin/revisions?id=${id}`)
  }, [router])

  // 返回列表
  const backToList = useCallback(() => {
    setDetail(null)
    router.replace('/admin/revisions')
  }, [router])

  // ── 权限不足 ──
  if (!session) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>请先登录</p>
      </div>
    )
  }
  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>无权限（仅管理员可访问）</p>
      </div>
    )
  }

  // ── 详情模式 ──
  if (selectedId) {
    if (detailLoading) {
      return (
        <div className={styles.page}>
          <p className={styles.loading}>加载中…</p>
        </div>
      )
    }
    if (!detail) {
      return (
        <div className={styles.page}>
          <p className={styles.error}>❌ 修订不存在</p>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={backToList}>
            ← 返回列表
          </button>
        </div>
      )
    }

    const conflict = detail.is_conflict

    return (
      <div className={styles.page}>
        {/* 详情标题 */}
        <div className={styles.detailSection}>
          <div className={styles.detailHeader}>
            <div className={styles.detailHeaderInfo}>
              <div className={styles.detailHeaderTitle}>
                审核：{detail.page_title}
                {conflict && (
                  <span className={`${styles.badge} ${styles.badgeConflict}`} style={{ marginLeft: 8 }}>
                    ⚠️ 冲突
                  </span>
                )}
              </div>
              <div className={styles.detailHeaderMeta}>
                {detail.author_name}（@{detail.author_username}）· 提交于 {formatTime(detail.created_at)}
                · 基于版本 #{detail.base_revision}，当前版本 #{detail.current_revision}
              </div>
            </div>
            <div className={styles.detailHeaderActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={backToList}>
                ← 返回
              </button>
            </div>
          </div>

          {/* 双栏：编辑器 | Diff */}
          <div className={styles.editorDiffLayout}>
            {/* 左：编辑器 */}
            <div className={styles.editorPane}>
              <div className={styles.editorPaneLabel}>
                <FaIcon name="pen" /> 编辑器（管理员可修改）
              </div>
              <div className={styles.editorPaneBody}>
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
                />
                <MarkdownEditor value={editContent} onChange={setEditContent} />
              </div>
            </div>

            {/* 右：Diff */}
            <div className={styles.diffPane}>
              <div className={styles.diffPaneLabel}>
                <FaIcon name="copy" /> Diff（点击可跳转）
              </div>
              <div className={styles.diffPaneBody} ref={diffContainerRef}>
                {diffLines.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-light)' }}>
                    内容相同，无差异
                  </div>
                ) : (
                  diffLines.map((line, i) => (
                    <div
                      key={i}
                      className={`${styles.diffLine} ${
                        line.type === 'add' ? styles.diffLineAdd :
                        line.type === 'del' ? styles.diffLineDel : ''
                      }`}
                      onClick={() => handleDiffLineClick(line)}
                    >
                      <span className={styles.diffLineNum}>
                        {line.type === 'del' ? line.oldLine : line.type === 'add' ? line.newLine : `${line.oldLine}`}
                      </span>
                      <span className={`${styles.diffLinePrefix} ${
                        line.type === 'add' ? styles.diffLinePrefixAdd :
                        line.type === 'del' ? styles.diffLinePrefixDel : ''
                      }`}>
                        {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
                      </span>
                      <span className={styles.diffLineContent}>{line.value || ' '}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 底部操作 */}
          <div className={styles.detailFooter}>
            <input
              className={styles.reviewCommentInput}
              type="text"
              placeholder="反馈意见（可选）…"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />
            <button
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={handleReject}
              disabled={submitting}
            >
              {submitting ? '处理中…' : '驳回'}
            </button>
            <button
              className={`${styles.btn} ${styles.btnSuccess}`}
              onClick={handleApprove}
              disabled={submitting}
            >
              {submitting ? '处理中…' : conflict ? '仍要批准（冲突）' : '批准'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 列表模式 ──
  return (
    <div className={styles.page}>
      <div className={styles.pageTitle}>
        <FaIcon name="gavel" /> 审核管理
      </div>

      {loading ? (
        <p className={styles.loading}>加载中…</p>
      ) : error ? (
        <p className={styles.error}>❌ {error}</p>
      ) : revisions.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyText}>没有待审核的编辑</div>
        </div>
      ) : (
        <div className={styles.revisionList}>
          {revisions.map((rev) => (
            <div
              key={rev.id}
              className={`${styles.revisionCard} ${rev.is_conflict ? styles.revisionCardConflict : ''} ${selectedId === rev.id ? styles.revisionCardSelected : ''}`}
              onClick={() => selectRevision(rev.id)}
            >
              <div className={styles.revisionInfo}>
                <div className={styles.revisionTitle}>
                  {rev.title}
                  {rev.is_conflict && (
                    <span className={`${styles.badge} ${styles.badgeConflict}`} style={{ marginLeft: 8 }}>
                      基于旧版本
                    </span>
                  )}
                </div>
                <div className={styles.revisionMeta}>
                  <span className={styles.revisionAuthor}>{rev.author_name}</span>
                  <span>在</span>
                  <span className={styles.revisionPage}>{rev.page_title}</span>
                  <span>· {formatTime(rev.created_at)}</span>
                  <span>· 基于 #{rev.base_revision} / 当前 #{rev.current_revision}</span>
                </div>
              </div>
              <div className={styles.revisionActions}>
                <span className={`${styles.badge} ${styles.badgePending}`}>待审核</span>
                <FaIcon name="chevron-right" className={styles.chevron} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatTime(dateStr: string): string {
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
