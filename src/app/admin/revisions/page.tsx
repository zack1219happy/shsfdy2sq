'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
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
import forumStyles from '@/styles/forum.module.css'

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
  const [editContent, setEditContent] = useState('')
  const [reviewComment, setReviewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const diffRef = useRef<HTMLDivElement>(null)

  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    fetchPendingRevisions()
      .then(setRevisions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isAdmin])

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
          setEditContent(d.content)
        }
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false))
  }, [selectedId, isAdmin])

  const diffLines: DiffLine[] = useMemo(() => {
    if (!detail) return []
    return lineDiff(detail.current_content, editContent)
  }, [detail, editContent])

  // 点击 diff 行 → diff 面板滚动到该行
  const handleDiffLineClick = useCallback((line: DiffLine) => {
    const el = diffRef.current
    if (!el) return
    const targetLine = line.type === 'add' ? line.newLine : line.oldLine
    if (!targetLine) return
    const lineHeight = 22
    el.scrollTo({ top: (targetLine - 5) * lineHeight, behavior: 'smooth' })
  }, [])

  const handleApprove = useCallback(async () => {
    if (!detail || submitting) return
    setSubmitting(true)
    try {
      await approveWikiRevision(detail.id, { content: editContent.trim() || detail.content })
      const updated = await fetchPendingRevisions()
      setRevisions(updated)
      setDetail(null)
      setReviewComment('')
      router.replace('/admin/revisions')
    } catch (e: any) {
      window.alert('批准失败: ' + (e.message || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }, [detail, editContent, submitting, router])

  const handleReject = useCallback(async () => {
    if (!detail || submitting) return
    if (!reviewComment.trim() && !window.confirm('没有填写反馈意见，确定要驳回吗？')) return
    setSubmitting(true)
    try {
      await rejectWikiRevision(detail.id, reviewComment.trim())
      const updated = await fetchPendingRevisions()
      setRevisions(updated)
      setDetail(null)
      setReviewComment('')
      router.replace('/admin/revisions')
    } catch (e: any) {
      window.alert('驳回失败: ' + (e.message || '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }, [detail, reviewComment, submitting, router])

  const selectRevision = useCallback((id: string) => {
    setReviewComment('')
    router.replace(`/admin/revisions?id=${id}`)
  }, [router])

  const backToList = useCallback(() => {
    setDetail(null)
    router.replace('/admin/revisions')
  }, [router])

  if (!session) return <div className={styles.page}><p className={styles.error}>请先登录</p></div>
  if (!isAdmin) return <div className={styles.page}><p className={styles.error}>无权限</p></div>

  // ── 详情模式 ──
  if (selectedId) {
    if (detailLoading) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
    if (!detail) return (
      <div className={styles.page}>
        <p className={styles.error}>❌ 修订不存在</p>
        <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={backToList}>← 返回列表</button>
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* 灰色衬底 header（对齐文章广场 detailHeader）— 全宽 */}
        <div className={forumStyles.detailHeader}>
          <div className={forumStyles.detailHeaderInner}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className={forumStyles.detailTitle}>
                  审核：{detail.page_title}
                  {detail.is_conflict && <span style={{ marginLeft: 10, fontSize: '0.9rem', color: '#c2410c' }}>⚠️ 冲突</span>}
                </h2>
                <div className={forumStyles.detailMeta}>
                  <UserName username={detail.author_username} />
                  <span>提交于 {formatTime(detail.created_at)}</span>
                  <span>基于 #{detail.base_revision}，当前 #{detail.current_revision}</span>
                </div>
              </div>
              <button className={forumStyles.backBtnIcon} onClick={backToList} title="返回列表">
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
        </div>

        <div className={styles.page} style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 0, overflow: 'hidden' }}>
          {/* 双栏：编辑器 + Diff */}
          <div className={styles.editorDiffLayout}>
          <div className={styles.editorPane}>
            <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorInner} />
          </div>

          <div className={styles.diffPane}>
            <div className={styles.diffPaneBody} ref={diffRef}>
              {diffLines.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-light)' }}>无差异</div>
              ) : (
                diffLines.map((line, i) => (
                  <div
                    key={i}
                    className={`${styles.diffLine} ${line.type === 'add' ? styles.diffLineAdd : line.type === 'del' ? styles.diffLineDel : ''}`}
                    onClick={() => handleDiffLineClick(line)}
                  >
                    <span className={styles.diffLineNum}>
                      {line.type === 'del' ? line.oldLine : line.type === 'add' ? line.newLine : line.oldLine}
                    </span>
                    <span className={`${styles.diffLinePrefix} ${line.type === 'add' ? styles.diffLinePrefixAdd : line.type === 'del' ? styles.diffLinePrefixDel : ''}`}>
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
        <div style={{ display: 'flex', gap: 8, padding: '12px 0', alignItems: 'center' }}>
          <input
            className={forumStyles.titleInput}
            type="text"
            placeholder="反馈意见（可选）…"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            style={{ flex: 1, fontSize: '0.85rem' }}
          />
          <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={handleReject} disabled={submitting}>
            {submitting ? '处理中…' : '驳回'}
          </button>
          <button className={`${forumStyles.btn} ${forumStyles.btnPrimary}`} onClick={handleApprove} disabled={submitting}>
            {submitting ? '处理中…' : '批准'}
          </button>
        </div>
      </div>
      </div>    )
  }

  // ── 列表模式 ──
  return (
    <div className={styles.page}>
      <div className={forumStyles.header}>
        <h2><FaIcon name="gavel" /> 审核管理</h2>
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
              className={`${styles.revisionCard} ${rev.is_conflict ? styles.revisionCardConflict : ''}`}
              onClick={() => selectRevision(rev.id)}
            >
              <div className={styles.revisionInfo}>
                <div className={styles.revisionTitle}>
                  {rev.title}
                  {rev.is_conflict && <span className={`${styles.badge} ${styles.badgeConflict}`} style={{ marginLeft: 8 }}>基于旧版本</span>}
                </div>
                <div className={styles.revisionMeta}>
                  <UserName username={rev.author_username} />
                  <span>在</span>
                  <span className={styles.revisionPage}>{rev.page_title}</span>
                  <span>· {formatTime(rev.created_at)}</span>
                  <span>· #{rev.base_revision}→#{rev.current_revision}</span>
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
