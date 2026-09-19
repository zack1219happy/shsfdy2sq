'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderMarkdown, createMarkdown, extractHeadingsFromHtml, type Heading } from '@/lib/markdown'
import { getSession, type UserSession } from '@/lib/auth'
import { markNotificationsReadForPage } from '@/lib/api/notifications'
import { awardPlazaArticlePoints, deletePlazaArticle, fetchPlazaArticle, fetchPlazaArticleNavigation, fetchPlazaArticleTips, fetchPlazaCategories, getPlazaStorage, getUserPlazaVote, removePlazaVote, sendPlazaPoints, setPlazaStorage, tipPlazaArticle, updatePlazaArticle, votePlazaArticle } from '@/lib/api/plaza'
import { fetchMyPoints } from '@/lib/api/points'
import { formatDate } from '@/lib/forum'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import { PostDetailShell, VoteBar } from '@/components/PostDetail'
import PointsAmountModal from '@/components/PointsAmountModal'
import ToggleField from '@/components/ToggleField'
import type { PlazaArticleDetail, PlazaArticleNavigation, PlazaCategory, PlazaAPI } from '@/types/plaza'
import { getCategoryPathById } from '@/types/plaza'
import { UserName } from '@/components/UserName'
import { showWarningToast } from '@/lib/toast'
import JSSafetyDialog from '@/components/JSSafetyDialog'
import { useAutoSave, loadDraft } from '@/hooks/useAutoSave'
import { useOptimisticVote } from '@/hooks/useOptimisticVote'
import styles from '@/styles/forum.module.css'
import pd from '@/styles/post-detail.module.css'

const MarkdownEditor = dynamic(
    () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
    { ssr: false },
)

declare global {
    interface Window {
        /** 暴露给 ```sandbox 沙箱 JS 的全局 API（同源 iframe 内通过 window.plazaAPI 访问） */
        plazaAPI?: PlazaAPI
    }
}

/* ==============================================================
   文章详情页 — 查看 / 编辑 / 删除 / 赞+踩 / 投币 / 奖励
   - 与论坛帖共用 PostDetailShell + VoteBar + 乐观投票
   - TOC 从渲染后 HTML 提取标题（与 wiki 一致）
   - 编辑模式：分类只读，可见性/JS 用 ToggleField
   - 静态路由 ?slug=xxx，与论坛帖子一致
   ============================================================== */

const TIP_PRESETS = [1, 2, 5, 10]

export default function PlazaArticlePage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const slug = searchParams.get('slug') || ''
    const fromCollection = searchParams.get('from') === 'collection'
    const collectionAuthorId = searchParams.get('collection_author_id') || ''
    const collectionPrefix = searchParams.get('collection_prefix') || ''

    const [article, setArticle] = useState<PlazaArticleDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [session, setSession] = useState<UserSession | null>(null)
    const [myVote, setMyVote] = useState<'up' | 'down' | null>(null)
    const [editing, setEditing] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editContent, setEditContent] = useState('')
    const [editIsPublic, setEditIsPublic] = useState(true)
    const [editHasJs, setEditHasJs] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [categories, setCategories] = useState<PlazaCategory[]>([])
    const [navigation, setNavigation] = useState<PlazaArticleNavigation | null>(null)
    // JS 模式：null=待决定，'safe'=安全模式，'js'=原文模式
    const [jsMode, setJsMode] = useState<'safe' | 'js' | null>(null)
    const [showDialog, setShowDialog] = useState(false)
    const [hasJs, setHasJs] = useState(false)
    // 弹窗开关
    const [showAwardModal, setShowAwardModal] = useState(false)
    const [showTipModal, setShowTipModal] = useState(false)

    useEffect(() => {
        if (!slug) return
        ;(async () => {
            try {
                setLoading(true)
                setError(null)
                setNavigation(null)
                const [a, s] = await Promise.all([
                    fetchPlazaArticle(slug),
                    getSession(),
                ])
                setArticle(a)
                setSession(s)
                // 加载成功后拉用户投票状态
                if (a) {
                    fetchPlazaArticleNavigation(a.id).then(setNavigation).catch(() => {})
                    void markNotificationsReadForPage(`plaza/${slug}`)
                        .then(() => window.dispatchEvent(new CustomEvent('new-notification')))
                        .catch(() => {})
                    getUserPlazaVote(a.id).then((v) => setMyVote(v as "up" | "down" | null)).catch(() => {})
                }
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : null)
            } finally {
                setLoading(false)
            }
        })()
    }, [slug])

    /** 局部刷新文章（更新 comment_count 等） */
    const refreshArticle = useCallback(async () => {
        if (!slug) return
        try {
            const a = await fetchPlazaArticle(slug)
            setArticle(a)
        } catch {}
    }, [slug])

    // 赞/踩乐观更新
    const { handleVote } = useOptimisticVote<PlazaArticleDetail>({
        item: article,
        setItem: setArticle,
        myVote,
        setMyVote,
        getId: (a) => a.id,
        readCounts: (a) => ({ up: a.like_count ?? 0, down: a.downvote_count ?? 0 }),
        writeCounts: (a, c) => ({ ...a, like_count: c.up, downvote_count: c.down }),
        vote: votePlazaArticle,
        removeVote: removePlazaVote,
        refresh: refreshArticle,
    })

    // ── 注入沙箱 JS 全局 API：window.plazaAPI ──
    // 每个 sandbox iframe（同源）内的桥接脚本会把自身 window.plazaAPI 指向这里，
    // 并把 setWindowHeight 替换为基于 frameElement 的实现。
    useEffect(() => {
        if (!article) return
        const api: PlazaAPI = {
            getUserInfo: async () => {
                const s = getSession()
                if (!s) return null
                const totalPoints = await fetchMyPoints()
                return { username: s.username, student_id: s.studentId, total_points: totalPoints }
            },
            setWindowHeight: () => {
                // 真实实现由 SandboxBox 注入 iframe 的桥接脚本负责（frameElement 定位自身 iframe），
                // 父页面该方法为 no-op，避免误用（无 iframe 上下文无法定位目标）。
            },
            sendPoints: (amount, cap, floor, once = false) =>
                sendPlazaPoints(article.id, amount, cap, floor, once),
            getArticleTips: () => fetchPlazaArticleTips(article.id),
            storage: {
                getItem: (key) => getPlazaStorage(article.id, key),
                setItem: (key, value) => setPlazaStorage(article.id, key, value),
            },
        }
        window.plazaAPI = api
        return () => {
            if (window.plazaAPI === api) delete window.plazaAPI
        }
    }, [article])

    useEffect(() => {
        loadPinyinInitialsFromDB()
        fetchPlazaCategories().then(setCategories).catch(() => {})
    }, [])

    // ── JS 安全模式：检测 has_js 并恢复 localStorage 偏好 ──
    const handleJsChoice = useCallback((mode: 'safe' | 'js', dismiss: boolean) => {
        setJsMode(mode)
        setShowDialog(false)
        if (dismiss && slug) {
            try {
                localStorage.setItem(`plaza_js_dismiss_${slug}`, mode)
            } catch { /* 忽略 */ }
        }
    }, [slug])

    const toggleJsMode = useCallback(() => {
        setJsMode((prev) => (prev === 'js' ? 'safe' : 'js'))
    }, [])

    useEffect(() => {
        if (!article) return
        void (async () => {
            const articleHasJs = article.has_js === true
            setHasJs(articleHasJs)

            if (!articleHasJs) {
                setJsMode('safe')
                return
            }

            if (editing) {
                // 编辑模式不需要弹窗
                setJsMode('safe')
                return
            }

            // JS 页面：检查 localStorage 是否有偏好
            try {
                const stored = localStorage.getItem(`plaza_js_dismiss_${slug}`)
                if (stored === 'safe' || stored === 'js') {
                    setJsMode(stored)
                    return
                }
            } catch { /* 忽略 */ }

            // 无存储偏好 → 显示弹窗
            setShowDialog(true)
        })()
    }, [article, slug, editing])

    // ── 编辑草稿恢复 ──
    useEffect(() => {
        if (!slug) return
        void (async () => {
            interface DraftData {
                title: string
                content: string
                isPublic: boolean
                hasJs: boolean
            }
            const draft = loadDraft<DraftData>(`plaza_edit_${slug}`)
            if (draft) {
                if (draft.title) setEditTitle(draft.title)
                if (draft.content) setEditContent(draft.content)
                if (draft.isPublic !== undefined) setEditIsPublic(draft.isPublic)
                if (draft.hasJs !== undefined) setEditHasJs(draft.hasJs)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时恢复一次草稿
    }, [])

    // 编辑模式自动保存草稿
    const editHasContent = editTitle.trim() !== '' || editContent.trim() !== ''
    const { clearDraft: clearEditDraft } = useAutoSave({
        key: `plaza_edit_${slug}`,
        data: { title: editTitle, content: editContent, isPublic: editIsPublic, hasJs: editHasJs },
        enabled: editing && editHasContent,
    })

    const isAuthor = session && article && session.userId === article.author_id
    const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

    const startEdit = () => {
        if (!article) return
        setEditTitle(article.title)
        setEditContent(article.content)
        setEditIsPublic(article.is_public)
        setEditHasJs(article.has_js === true)
        setEditing(true)
    }

    const cancelEdit = () => {
        setEditing(false)
        setEditTitle('')
        setEditContent('')
        setEditIsPublic(true)
        setEditHasJs(false)
        clearEditDraft()
    }

    const submitEdit = async () => {
        if (!article || !editTitle.trim() || !editContent.trim() || submitting) return
        setSubmitting(true)
        try {
            await updatePlazaArticle(
                article.id,
                editTitle.trim(),
                editContent.trim(),
                article.category_id,
                editIsPublic,
                editHasJs,
            )
            clearEditDraft()
            setEditing(false)
            setArticle((prev) =>
                prev
                    ? { ...prev, title: editTitle.trim(), content: editContent.trim(), is_public: editIsPublic, has_js: editHasJs }
                    : null,
            )
        } catch (e: unknown) {
            showWarningToast(e instanceof Error && e.message ? e.message : '编辑失败')
        } finally {
            setSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!window.confirm('确定要删除这篇文章吗？此操作不可撤销。')) return
        try {
            await deletePlazaArticle(article!.id)
            router.push('/plaza')
        } catch (e: unknown) {
            showWarningToast(e instanceof Error && e.message ? e.message : '删除失败')
        }
    }

    const collectionHref = useMemo(() => {
        const authorId = collectionAuthorId || navigation?.collection_author_id || ''
        const prefix = collectionPrefix || navigation?.collection_prefix || ''
        if (!authorId || !prefix) return '/plaza'
        const params = new URLSearchParams({
            author_id: authorId,
            prefix,
        })
        return '/plaza/collection?' + params.toString()
    }, [collectionAuthorId, collectionPrefix, navigation])

    const hasCollectionContext = fromCollection || navigation !== null

    const goToNeighbor = useCallback((neighborSlug: string) => {
        if (!navigation) return
        const params = new URLSearchParams({
            slug: neighborSlug,
            from: 'collection',
            collection_author_id: navigation.collection_author_id,
            collection_prefix: navigation.collection_prefix,
        })
        router.push('/plaza/post?' + params.toString())
    }, [navigation, router])

    // 提取标题用于 TOC（必须在早期 return 之前，保证 hooks 数量一致）
    const articleHtml = useMemo(() => {
        if (!article?.content) return ''
        try {
            const md = createMarkdown({ highlight: true, texmath: true, anchor: true })
            return md.render(article.content)
        } catch { return '' }
    }, [article])

    const headings: Heading[] = useMemo(
        () => extractHeadingsFromHtml(articleHtml),
        [articleHtml],
    )

    if (!slug) return <div className={styles.page}><p className={styles.loading}>缺少文章标识</p></div>
    if (loading) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
    if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
    if (!article) return <div className={styles.page}><p className={styles.error}>❌ 文章不存在</p></div>

    return (
        <>
            {/* TOC 可见时右侧让位，标题栏与正文在剩余窗口居中（同 wiki 的 page-content 方案） */}
            <div className={pd.tocWrap}>
                <PostDetailShell
                    title={editing ? (
                        <input
                            className={styles.titleInput}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            maxLength={100}
                            autoFocus
                        />
                    ) : (
                        <h1 className={pd.detailTitle}>
                            <span dangerouslySetInnerHTML={{ __html: renderMarkdown(article.title) }} />
                            {isAdmin && article.is_awarded && (
                                <span style={{ fontSize: '0.8rem', opacity: 0.45, marginLeft: 8 }}>
                                    🏅
                                </span>
                            )}
                        </h1>
                    )}
                    actions={<>
                        {isAuthor && !editing && (
                            <>
                                <button className={pd.backBtnIcon} onClick={startEdit} title="编辑文章">
                                    <FaIcon name="pen" />
                                </button>
                                <button
                                    className={pd.backBtnIcon}
                                    onClick={handleDelete}
                                    title="删除文章"
                                    style={{ color: '#dc2626' }}
                                >
                                    <FaIcon name="times" />
                                </button>
                            </>
                        )}
                        {isAdmin && !editing && (
                            <button
                                className={pd.backBtnIcon}
                                onClick={() => setShowAwardModal(true)}
                                title="奖励积分"
                            >
                                <FaIcon name="gift" />
                            </button>
                        )}
                        {hasJs && jsMode && !editing && (
                            <button
                                className={pd.backBtnIcon}
                                onClick={toggleJsMode}
                                title={jsMode === 'js' ? 'JS 模式（点击切换到安全模式）' : '安全模式（点击切换到原文）'}
                                style={{
                                    color: jsMode === 'js' ? '#e74c3c' : undefined,
                                    opacity: jsMode === 'js' ? 1 : 0.6,
                                }}
                            >
                                <FaIcon name="code" />
                            </button>
                        )}
                        <button
                            className={pd.backBtnIcon}
                            onClick={editing ? cancelEdit : () => router.push(hasCollectionContext ? collectionHref : '/plaza')}
                            title={editing ? '取消编辑' : (hasCollectionContext ? '返回集锦' : '返回列表')}
                        >
                            <FaIcon name="chevron-left" />
                        </button>
                    </>}
                    meta={<>
                        <UserName username={article.author_username} userId={article.author_id} className={pd.detailAuthor} />
                        <span>发布于 {formatDate(article.created_at)}</span>
                        {article.updated_at !== article.created_at && (
                            <span>编辑于 {formatDate(article.updated_at)}</span>
                        )}
                        <span style={{ color: 'var(--color-text-light)' }}>
                            {categories.length > 0 && article.category_id
                                ? getCategoryPathById(categories, article.category_id).join(' · ')
                                : ''}
                        </span>
                        {!article.is_public && (
                            <span style={{ color: '#b35a00', fontSize: '0.82rem' }}>🔒 私密</span>
                        )}
                        {editing && <span style={{ color: 'var(--color-primary)' }}>编辑中</span>}
                    </>}
                >
                    {editing ? (
                        <div className={styles.newPostForm}>
                            <ToggleField
                                label="可见性"
                                checked={editIsPublic}
                                onChange={setEditIsPublic}
                                onText="公开（所有人可见）"
                                offText="私密（仅自己可见）"
                                padded
                            />

                            {/* 编辑模式：JS 开关 */}
                            <ToggleField
                                label="JavaScript"
                                tooltip="开启后，读者可选择直接运行页面中的 JavaScript（跳过安全过滤）。仅在您信任内容的情况下使用。"
                                checked={editHasJs}
                                onChange={setEditHasJs}
                                onText="开启"
                                offText="关闭"
                                padded
                            />

                            <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
                                <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} noSanitizePreview={editHasJs} />
                            </div>
                            <div className={styles.formActions}>
                                <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEdit}>
                                    取消
                                </button>
                                <button
                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                    onClick={submitEdit}
                                    disabled={submitting}
                                >
                                    {submitting ? '保存中…' : '保存'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={pd.detail}>
                            <div className={pd.detailBody}>
                                <WikiContent content={article.content} className="wiki-body" noSanitize={jsMode === 'js'} format="markdown" contextUserId={article.author_id} />
                            </div>

                            {navigation && (
                                <div className={pd.articleNavigation} aria-label="集锦文章导航">
                                    <button
                                        className={pd.articleNavigationButton}
                                        disabled={!navigation.previous_slug}
                                        onClick={() => navigation.previous_slug && goToNeighbor(navigation.previous_slug)}
                                    >
                                        <span className={pd.articleNavigationLabel}>上一篇</span>
                                        <span className={pd.articleNavigationTitle}>
                                            {navigation.previous_title || '没有上一篇'}
                                        </span>
                                    </button>
                                    <button
                                        className={`${pd.articleNavigationButton} ${pd.articleNavigationNext}`}
                                        disabled={!navigation.next_slug}
                                        onClick={() => navigation.next_slug && goToNeighbor(navigation.next_slug)}
                                    >
                                        <span className={pd.articleNavigationLabel}>下一篇</span>
                                        <span className={pd.articleNavigationTitle}>
                                            {navigation.next_title || '没有下一篇'}
                                        </span>
                                    </button>
                                </div>
                            )}

                            {/* 点赞栏 + 投币入口 */}
                            <VoteBar
                                up={article.like_count ?? 0}
                                down={article.downvote_count ?? 0}
                                myVote={myVote}
                                onVote={handleVote}
                            >
                                {session && !editing && (
                                    <button
                                        className={pd.voteIcon}
                                        onClick={isAuthor ? undefined : () => setShowTipModal(true)}
                                        title="投币"
                                        style={{ opacity: isAuthor ? 0.4 : 1, cursor: isAuthor ? 'default' : 'pointer' }}
                                    >
                                        <FaIcon name="coins" />
                                    </button>
                                )}
                                <span className={pd.voteCount}>{article.tip_count ?? 0}</span>
                            </VoteBar>

                            {/* 评论区 */}
                            <CommentSection source="plaza" targetId={article.id} title="评论" />
                        </div>
                    )}
                </PostDetailShell>
            </div>

            {/* TOC */}
            <TableOfContents headings={headings} />

            {/* 奖励积分弹窗 */}
            <PointsAmountModal
                open={showAwardModal}
                onClose={() => setShowAwardModal(false)}
                title="🏆 奖励积分"
                subtitle={<>作者：{article.author_username}</>}
                presets={[10, 30, 50]}
                initialAmount={30}
                maxAmount={999}
                busyLabel="发放中…"
                confirmLabel={(n) => `确认奖励 ${n} 分`}
                successText={(n) => `成功奖励 ${n} 积分`}
                fallbackError="奖励失败"
                onSubmit={(amount) => awardPlazaArticlePoints(article.id, amount)}
            />

            {/* 投币弹窗 */}
            <PointsAmountModal
                open={showTipModal}
                onClose={() => setShowTipModal(false)}
                title="🪙 投币"
                subtitle={<>打赏 {article.author_username} — 消耗你的积分</>}
                presets={TIP_PRESETS}
                allowCustom
                initialAmount={5}
                maxAmount={9999}
                busyLabel="发送中…"
                confirmLabel={(n) => `确认投币 ${n} 分`}
                successText={(n) => `成功投币 ${n} 积分`}
                fallbackError="投币失败"
                onSubmit={(amount) => tipPlazaArticle(article.id, amount)}
                onSuccess={(amount) =>
                    setArticle((prev) => (prev ? { ...prev, tip_count: (prev.tip_count ?? 0) + amount } : prev))
                }
            />

            {/* JS 安全警告弹窗 */}
            {showDialog && (
                <JSSafetyDialog onChoice={handleJsChoice} />
            )}
        </>
    )
}
