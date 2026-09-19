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
    fetchPendingPageRequests,
    fetchPageRequestDetail,
    approvePageRequest,
    rejectPageRequest,
    type WikiRevision,
    type RevisionDetail,
    fetchPageAssets,
    type PageRequest,
    type PageRequestDetail,
} from '@/lib/wiki-api'
import { lineDiff, type DiffLine } from '@/lib/diff'
import { useReviewFlow } from '@/hooks/useReviewFlow'
import styles from '@/styles/admin.module.css'
import forumStyles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
    () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
    { ssr: false },
)

export default function AdminRevisionsPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const tab = searchParams.get('tab') || 'revisions'
    const selectedId = searchParams.get('id') || ''
    const prSelectedId = searchParams.get('rid') || ''

    const [session] = useState(getSession())
    const isAdmin = !!session && ['admin', 'super_admin'].includes(session.role)
    const [assetsMap, setAssetsMap] = useState<Record<string, string>>({})

    // ── 编辑修订审核流 ──
    const revisions = useReviewFlow<WikiRevision, RevisionDetail>({
        active: true,
        enabled: isAdmin,
        selectedId,
        fetchList: fetchPendingRevisions,
        fetchDetail: fetchRevisionDetail,
        initDraft: (d) => ({ content: d.content }),
        onSettled: () => router.replace('/admin/revisions'),
    })
    const { draft: revDraft, setDraft: setRevDraft, comment: revComment, setComment: setRevComment } = revisions

    // ── 新建页面请求审核流 ──
    const requests = useReviewFlow<PageRequest, PageRequestDetail>({
        active: tab === 'requests',
        enabled: isAdmin,
        selectedId: prSelectedId,
        fetchList: fetchPendingPageRequests,
        fetchDetail: fetchPageRequestDetail,
        initDraft: (d) => ({ title: d.title, content: d.content }),
        onSettled: () => router.replace('/admin/revisions?tab=requests'),
    })
    const { draft: prDraft, setDraft: setPrDraft, comment: prComment, setComment: setPrComment } = requests

    // 详情加载后拉取 _assets/ 图片（预览面板渲染 DB 图片；沿父 slug 向上遍历，与 WikiContent 同规则）
    useEffect(() => {
        const slug = revisions.detail?.slug ?? requests.detail?.slug
        if (!slug) return
        let alive = true
        const segments = slug.split('/')
        ;(async () => {
            const merged = new Map<string, string>()
            for (let i = segments.length; i > 0; i--) {
                try {
                    const assets = await fetchPageAssets(segments.slice(0, i).join('/'))
                    for (const [k, v] of assets) { if (!merged.has(k)) merged.set(k, v) }
                } catch { /* 跳过 */ }
            }
            if (alive) setAssetsMap(Object.fromEntries(merged))
        })()
        return () => { alive = false }
    }, [revisions.detail?.slug, requests.detail?.slug])

    // ── Diff（仅编辑修订）──
    const diffLines: DiffLine[] = useMemo(() => {
        if (!revisions.detail) return []
        return lineDiff(revisions.detail.current_content, revDraft.content)
    }, [revisions.detail, revDraft.content])

    const diffRef = useRef<HTMLDivElement>(null)
    const handleDiffLineClick = useCallback((line: DiffLine) => {
        const el = diffRef.current
        if (!el) return
        const targetLine = line.type === 'add' ? line.newLine : line.oldLine
        if (!targetLine) return
        const lineHeight = 22
        el.scrollTo({ top: (targetLine - 5) * lineHeight, behavior: 'smooth' })
    }, [])

    // ── 操作 ──
    const approveRevision = () =>
        revisions.act('approve', (id, d, _c, cur) => approveWikiRevision(id, { content: d.content.trim() || cur.content }))
    const rejectRevision = () =>
        revisions.act('reject', (id, _d, c) => rejectWikiRevision(id, c.trim()))
    const approveRequest = () =>
        requests.act('approve', (id, d, _c, cur) =>
            approvePageRequest(id, { title: d.title.trim() || cur.title, content: d.content.trim() || cur.content }))
    const rejectRequest = () =>
        requests.act('reject', (id, _d, c) => rejectPageRequest(id, c.trim()))

    const selectRevision = useCallback((id: string) => {
        revisions.open(id)
        router.replace(`/admin/revisions?id=${id}`)
    }, [revisions, router])

    const selectPr = useCallback((id: string) => {
        requests.open(id)
        router.replace(`/admin/revisions?tab=requests&rid=${id}`)
    }, [requests, router])

    const backToList = useCallback(() => {
        revisions.close()
        router.replace('/admin/revisions')
    }, [revisions, router])

    const backToPrList = useCallback(() => {
        requests.close()
        router.replace('/admin/revisions?tab=requests')
    }, [requests, router])

    const switchTab = useCallback((t: string) => {
        revisions.close()
        requests.close()
        const suffix = t === 'requests' ? '?tab=requests' : ''
        router.replace(`/admin/revisions${suffix}`)
    }, [revisions, requests, router])

    if (!session) return <div className={styles.page}><p className={styles.error}>请先登录</p></div>
    if (!isAdmin) return <div className={styles.page}><p className={styles.error}>无权限</p></div>

    // ==============================================================
    //  渲染：审核管理
    // ==============================================================
    return (
        <div className={selectedId || prSelectedId ? `${styles.page} ${styles.pageWide}` : styles.page}>
            <div className={forumStyles.header}>
                <h2><FaIcon name="gavel" /> 审核管理</h2>
            </div>

            {/* ── Tab 导航 ── */}
            <div className={styles.tabNav}>
                <TabButton active={tab !== 'requests'} onClick={() => switchTab('revisions')}>
                    <FaIcon name="pen" /> 编辑审核
                </TabButton>
                <TabButton active={tab === 'requests'} onClick={() => switchTab('requests')}>
                    <FaIcon name="plus" /> 新建页面审核
                </TabButton>
            </div>

            {tab === 'requests' ? renderPrPanel() : renderRevisionPanel()}
        </div>
    )

    // ==============================================================
    //  编辑审核面板（详情含双栏编辑器 + Diff）
    // ==============================================================
    function renderRevisionPanel() {
        const { detail, detailLoading } = revisions
        if (selectedId) {
            if (detailLoading) return <p className={styles.loading}>加载中…</p>
            if (!detail) return (
                <>
                    <p className={styles.error}>❌ 修订不存在</p>
                    <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={backToList}>← 返回列表</button>
                </>
            )

            return (
                <div className={styles.detailWrap}>
                    {/* header */}
                    <div className={styles.reviewHeader}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 className={styles.reviewTitle}>
                                审核：{detail.page_title}
                                {detail.is_conflict && <span className={styles.conflictTag}>⚠️ 基于旧版本</span>}
                            </h2>
                            <div className={styles.reviewMeta}>
                                <UserName username={detail.author_username} userId={detail.author_id} />
                                <span>提交于 {formatTime(detail.created_at)}</span>
                                <span>基于 #{detail.base_revision}，当前 #{detail.current_revision}</span>
                            </div>
                        </div>
                        <button className={styles.reviewBack} onClick={backToList} title="返回列表">
                            <FaIcon name="chevron-left" />
                        </button>
                    </div>

                    {/* 双栏编辑器 + Diff */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                        <div className={styles.editorDiffLayout}>
                            <div className={styles.editorPane}>
                                <MarkdownEditor value={revDraft.content} onChange={(v) => setRevDraft({ ...revDraft, content: v })} className={styles.editorInner} assetsMap={assetsMap} contextUserId={null} />
                            </div>
                            <div className={styles.diffPane}>
                                <div className={styles.diffPaneHead}>
                                    <span>与当前版本的差异</span>
                                    <span className={styles.diffStats}>
                                        <span className={styles.diffStatsAdd}>+{diffLines.filter((l) => l.type === 'add').length}</span>
                                        <span className={styles.diffStatsDel}>−{diffLines.filter((l) => l.type === 'del').length}</span>
                                    </span>
                                </div>
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

                        <ReviewActionBar
                            comment={revComment} onCommentChange={setRevComment}
                            onReject={rejectRevision} onApprove={approveRevision}
                            submitting={revisions.submitting}
                        />
                    </div>
                </div>
            )
        }

        // ── 列表模式 ──
        const { items, loading, error } = revisions
        return (
            <>
                {loading ? (
                    <p className={styles.loading}>加载中…</p>
                ) : error ? (
                    <p className={styles.error}>❌ {error}</p>
                ) : items.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>✅</div>
                        <div className={styles.emptyText}>没有待审核的编辑</div>
                    </div>
                ) : (
                    <div className={styles.revisionList}>
                        {items.map((rev) => (
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
                                        <UserName username={rev.author_username} userId={rev.author_id} />
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
            </>
        )
    }

    // ==============================================================
    //  新建页面审核面板（详情为标题 + 编辑器，无 Diff）
    // ==============================================================
    function renderPrPanel() {
        const { detail, detailLoading } = requests
        if (prSelectedId) {
            if (detailLoading) return <p className={styles.loading}>加载中…</p>
            if (!detail) return (
                <>
                    <p className={styles.error}>❌ 请求不存在</p>
                    <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={backToPrList}>← 返回列表</button>
                </>
            )

            return (
                <div className={styles.detailWrap}>
                    {/* header */}
                    <div className={styles.reviewHeader}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 className={styles.reviewTitle}>
                                审核新建页面：{detail.title}
                            </h2>
                            <div className={styles.reviewMeta}>
                                <UserName username={detail.author_username} userId={detail.author_id} />
                                <span>提交于 {formatTime(detail.created_at)}</span>
                                <span style={{ fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                                    /wiki/{detail.slug}
                                </span>
                            </div>
                        </div>
                        <button className={styles.reviewBack} onClick={backToPrList} title="返回列表">
                            <FaIcon name="chevron-left" />
                        </button>
                    </div>

                    {/* 编辑器 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
                        <input
                            className={forumStyles.titleInput}
                            type="text"
                            placeholder="页面标题"
                            value={prDraft.title}
                            onChange={(e) => setPrDraft({ ...prDraft, title: e.target.value })}
                            style={{ fontSize: '0.95rem', flexShrink: 0 }}
                        />

                        <div className={styles.prEditorWrap}>
                            <MarkdownEditor
                                value={prDraft.content}
                                onChange={(v) => setPrDraft({ ...prDraft, content: v })}
                                className={forumStyles.editorNoBorder}
                                assetsMap={assetsMap}
                                contextUserId={null}
                            />
                        </div>
                    </div>

                    <ReviewActionBar
                        comment={prComment} onCommentChange={setPrComment}
                        onReject={rejectRequest} onApprove={approveRequest}
                        submitting={requests.submitting}
                    />
                </div>
            )
        }

        // ── 列表模式 ──
        const { items, loading, error } = requests
        return (
            <>
                {loading ? (
                    <p className={styles.loading}>加载中…</p>
                ) : error ? (
                    <p className={styles.error}>❌ {error}</p>
                ) : items.length === 0 ? (
                    <div className={styles.empty}>
                        <div className={styles.emptyIcon}>📭</div>
                        <div className={styles.emptyText}>没有待审核的新建页面请求</div>
                    </div>
                ) : (
                    <div className={styles.revisionList}>
                        {items.map((req) => (
                            <div
                                key={req.id}
                                className={styles.revisionCard}
                                onClick={() => selectPr(req.id)}
                            >
                                <div className={styles.revisionInfo}>
                                    <div className={styles.revisionTitle}>
                                        <span style={{ marginRight: 6, fontSize: '0.8rem' }}><FaIcon name="plus" /></span>
                                        {req.title}
                                    </div>
                                    <div className={styles.revisionMeta}>
                                        <UserName username={req.author_username} userId={req.author_id} />
                                        <span>新建</span>
                                        <span className={styles.revisionPage}>{req.slug}</span>
                                        <span>· {formatTime(req.created_at)}</span>
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
            </>
        )
    }
}

// ── 底部操作条：反馈意见 + 驳回 + 批准 ──
function ReviewActionBar({ comment, onCommentChange, onReject, onApprove, submitting }: {
    comment: string
    onCommentChange: (v: string) => void
    onReject: () => void
    onApprove: () => void
    submitting: boolean
}) {
    return (
        <div className={styles.actionBar}>
            <input
                className={forumStyles.titleInput}
                type="text"
                placeholder="反馈意见（可选）…"
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                style={{ flex: 1, fontSize: '0.85rem' }}
            />
            <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={onReject} disabled={submitting}>
                {submitting ? '处理中…' : '驳回'}
            </button>
            <button className={`${forumStyles.btn} ${forumStyles.btnPrimary}`} onClick={onApprove} disabled={submitting}>
                {submitting ? '处理中…' : '批准'}
            </button>
        </div>
    )
}

// ── Tab 按钮组件 ──
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`${styles.tabBtn} ${active ? styles.tabBtnActive : ''}`}
        >
            {children}
        </button>
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
