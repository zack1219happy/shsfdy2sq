'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderMarkdown } from '@/lib/markdown'
import { getSession } from '@/lib/auth'
import { fetchForumPost, getUserForumVote, removeForumVote, updateForumPost, voteForumPost } from '@/lib/api/forum'
import { markNotificationsReadForPage } from '@/lib/api/notifications'
import { fetchAllUsers } from '@/lib/api/users'
import CommentSection from '@/components/CommentSection'
import VisibilityBar from '@/components/VisibilityBar'
import VisibilityModal from '@/components/VisibilityModal'
import { PostDetailShell, VoteBar } from '@/components/PostDetail'
import { useOptimisticVote } from '@/hooks/useOptimisticVote'
import type { ForumPost, UserInfo } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import { UserName } from '@/components/UserName'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import { useAutoSave, loadDraft } from '@/hooks/useAutoSave'
import styles from '@/styles/forum.module.css'
import pd from '@/styles/post-detail.module.css'

const MarkdownEditor = dynamic(
    () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
    { ssr: false },
)

export default function ForumPostPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const postId = searchParams.get('id') || ''

    const [post, setPost] = useState<ForumPost | null>(null)
    const [loadedPostId, setLoadedPostId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const loading = loadedPostId !== postId
    const [session, setSession] = useState<{ userId: string; username: string } | null>(null)
    const [myVote, setMyVote] = useState<'up' | 'down' | null>(null)
    const [editing, setEditing] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editContent, setEditContent] = useState('')
    const [editExcludedIds, setEditExcludedIds] = useState<string[]>([])
    const [editAgentVisible, setEditAgentVisible] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [allUsers, setAllUsers] = useState<UserInfo[]>([])
    const [usersLoading, setUsersLoading] = useState(true)
    const [showVisibilityModal, setShowVisibilityModal] = useState(false)

    /** 全量加载（首次 / 出错时用） */
    const load = useCallback(() => {
        if (!postId) return
        Promise.all([
            fetchForumPost(postId),
            getSession(),
            getUserForumVote(postId).catch(() => null),
        ])
            .then(([p, s, v]) => {
                setError(null)
                if (!p) { setError('帖子不存在'); return }
                setPost(p)
                setSession(s)
                setMyVote(v as "up" | "down" | null)
                void markNotificationsReadForPage(`forum/${postId}`)
                    .then(() => window.dispatchEvent(new CustomEvent('new-notification')))
                    .catch(() => {})
                fetchAllUsers().then(setAllUsers).catch(() => {}).finally(() => setUsersLoading(false))
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : null))
            .finally(() => setLoadedPostId(postId))
    }, [postId])

    /** 局部刷新：只重拉帖子 + 我的投票（投票后、编辑后），不触发 loading */
    const refreshPostOnly = useCallback(async () => {
        if (!postId) return
        try {
            const [p, v] = await Promise.all([
                fetchForumPost(postId),
                getUserForumVote(postId).catch(() => null),
            ])
            if (p) { setPost(p); setMyVote(v as "up" | "down" | null) }
        } catch {}
    }, [postId])

    // 赞/踩乐观更新
    const { handleVote } = useOptimisticVote<ForumPost>({
        item: post,
        setItem: setPost,
        myVote,
        setMyVote,
        getId: (p) => p.id,
        readCounts: (p) => ({ up: p.upvotes ?? 0, down: p.downvotes ?? 0 }),
        writeCounts: (p, c) => ({ ...p, upvotes: c.up, downvotes: c.down }),
        vote: voteForumPost,
        removeVote: removeForumVote,
        refresh: refreshPostOnly,
    })

    useEffect(() => { load() }, [load])

    // 客户端初始化：加载拼音首字母
    useEffect(() => { loadPinyinInitialsFromDB() }, [])

    // 编辑模式草稿恢复
    useEffect(() => {
        if (!postId) return
        void (async () => {
            interface DraftData {
                title: string
                content: string
                excludedUserIds: string[]
                agentVisible?: boolean
            }
            const draft = loadDraft<DraftData>(`forum_edit_${postId}`)
            if (draft && postId) {
                // 有草稿时自动进入编辑模式
                if (draft.title) setEditTitle(draft.title)
                if (draft.content) setEditContent(draft.content)
                if (draft.excludedUserIds) setEditExcludedIds(draft.excludedUserIds)
                if ('agentVisible' in draft) setEditAgentVisible(draft.agentVisible ?? true)
            }
        })()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时恢复一次草稿
    }, [])

    // 编辑模式自动保存草稿
    const editHasContent = editTitle.trim() !== '' || editContent.trim() !== ''
    const { clearDraft: clearEditDraft } = useAutoSave({
        key: `forum_edit_${postId}`,
        data: { title: editTitle, content: editContent, excludedUserIds: editExcludedIds, agentVisible: editAgentVisible },
        enabled: editing && editHasContent,
    })

    const startEdit = () => {
        if (!post) return
        setEditTitle(post.title)
        setEditContent(post.content)
        setEditExcludedIds(post.excluded_visibility ?? [])
        setEditAgentVisible(post.agent_visible ?? true)
        setEditing(true)
    }

    const cancelEdit = () => {
        setEditing(false)
        setEditTitle('')
        setEditContent('')
        setEditExcludedIds([])
        clearEditDraft()
    }

    const submitEdit = async () => {
        if (!post || !editTitle.trim() || !editContent.trim() || submitting) return
        setSubmitting(true)
        try {
            await updateForumPost(post.id, editTitle.trim(), editContent.trim(), editExcludedIds, editAgentVisible)
            clearEditDraft()
            setEditing(false)
            refreshPostOnly()
        } catch (e: unknown) { setError(e instanceof Error ? e.message : null) }
        finally { setSubmitting(false) }
    }

    const isAuthor = session && post && session.userId === post.author_id
    const editExcludedUsers = allUsers.filter((u) => editExcludedIds.includes(u.id))

    if (!postId) return <div className={styles.page}><p>缺少帖子 ID</p></div>
    if (loading) return <div className={styles.page}><p className={styles.loading}>加载中&hellip;</p></div>
    if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
    if (!post) return <div className={styles.page}><p className={styles.error}>❌ 帖子不存在</p></div>

    return (
        <>
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
                    <h1 className={pd.detailTitle} dangerouslySetInnerHTML={{ __html: renderMarkdown(post.title) }} />
                )}
                actions={<>
                    {isAuthor && !editing && (
                        <button className={pd.backBtnIcon} onClick={startEdit} title="编辑帖子">
                            <FaIcon name="pen" />
                        </button>
                    )}
                    <button
                        className={pd.backBtnIcon}
                        onClick={editing ? cancelEdit : () => router.push('/forum')}
                        title={editing ? '取消编辑' : '返回讨论区'}
                    >
                        <FaIcon name="chevron-left" />
                    </button>
                </>}
                meta={<>
                    <UserName username={post.author_username} userId={post.author_id} className={pd.detailAuthor} />
                    <span>发布于 {formatDate(post.created_at)}</span>
                    {post.updated_at !== post.created_at && (
                        <span>编辑于 {formatDate(post.updated_at)}</span>
                    )}
                    {editing && <span style={{ color: 'var(--color-primary)' }}>编辑中</span>}
                </>}
            >
                {editing ? (
                    <div className={styles.newPostForm}>
                        <VisibilityBar
                            excludedUsers={editExcludedUsers}
                            onOpenModal={() => setShowVisibilityModal(true)}
                            onRemoveExclude={(userId) =>
                                setEditExcludedIds((prev) => prev.filter((id) => id !== userId))
                            }
                            agentVisible={editAgentVisible}
                            onAgentVisibleChange={setEditAgentVisible}
                        />
                        <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
                            <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} />
                        </div>
                        <div className={styles.formActions}>
                            <button className={`${styles.btn} ${styles.btnOutline}`} onClick={cancelEdit}>取消</button>
                            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={submitEdit} disabled={submitting}>
                                {submitting ? '保存中&hellip;' : '保存'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={pd.detail}>
                        <div className={pd.detailBody}>
                            <WikiContent content={post.content} className="wiki-body" contextUserId={post.author_id} />
                        </div>

                        <VoteBar
                            up={post.upvotes ?? 0}
                            down={post.downvotes ?? 0}
                            myVote={myVote}
                            onVote={handleVote}
                        />

                        <CommentSection source="forum" targetId={postId} title="评论" />
                    </div>
                )}
            </PostDetailShell>

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
