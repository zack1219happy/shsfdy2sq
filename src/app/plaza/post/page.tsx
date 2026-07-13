'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { renderClient, createClientMd } from '@/lib/render-client'
import { getSession } from '@/lib/auth'
import {
  fetchPlazaArticle,
  deletePlazaArticle,
  updatePlazaArticle,
  votePlazaArticle,
  removePlazaVote,
  getUserPlazaVote,
  fetchPlazaComments,
  addPlazaComment,
  deletePlazaComment,
} from '@/lib/gist-api'
import { loadPinyinInitialsFromDB } from '@/lib/people'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import type { Heading } from '@/lib/content'
import type { PlazaArticleDetail, PlazaComment } from '@/types/plaza'
import type { UnifiedComment } from '@/components/CommentSection'
import { UserName } from '@/components/UserName'
import { showWarningToast } from '@/lib/toast'
import { extractHeadingsFromHtml } from '@/lib/plaza-headings'
import styles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/* ==============================================================
   文章详情页 — 查看 / 编辑 / 删除 / 赞+踩
   - 复用论坛 detailHeader + detailBody + voteBar 布局
   - TOC 从渲染后 HTML 提取标题（与 wiki 一致）
   - 编辑模式：分类只读，可见性用 toggleSwitch
   - 静态路由 ?slug=xxx，与论坛帖子一致
   ============================================================== */

export default function PlazaArticlePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''

  const [article, setArticle] = useState<PlazaArticleDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<{ userId: string; username: string } | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [comments, setComments] = useState<PlazaComment[]>([])
  const [refreshCooldown, setRefreshCooldown] = useState(0)
  const [spinning, setSpinning] = useState(false)

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
        // 加载成功后拉评论 + 用户投票状态
        if (a) {
          fetchPlazaComments(a.id).then(setComments).catch(() => {})
          getUserPlazaVote(a.id).then(setMyVote).catch(() => {})
        }
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
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
    setEditIsPublic(true)
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
      setArticle((prev) =>
        prev
          ? { ...prev, title: editTitle.trim(), content: editContent.trim(), is_public: editIsPublic }
          : null,
      )
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

  const handleVote = async (type: 'up' | 'down') => {
    if (!article) return
    // 乐观更新：立即反映 UI
    const prevVote = myVote
    setArticle((p) => {
      if (!p) return p
      const next = { ...p }
      // 撤销之前的投票（如果有）
      if (prevVote === 'up') next.like_count = Math.max(0, (next.like_count ?? 0) - 1)
      if (prevVote === 'down') next.downvote_count = Math.max(0, (next.downvote_count ?? 0) - 1)
      if (type !== prevVote) {
        // 新投票
        if (type === 'up') next.like_count = (next.like_count ?? 0) + 1
        if (type === 'down') next.downvote_count = (next.downvote_count ?? 0) + 1
        setMyVote(type)
      } else {
        setMyVote(null)
      }
      return next
    })
    try {
      if (myVote === type) {
        await removePlazaVote(article.id)
      } else {
        await votePlazaArticle(article.id, type)
      }
      // 后台同步确保一致性
      refreshArticle()
    } catch {
      // 回滚
      setMyVote(prevVote)
      refreshArticle()
    }
  }

  /** 局部刷新评论列表 */
  const refreshComments = useCallback(async () => {
    if (!article) return
    try {
      const c = await fetchPlazaComments(article.id)
      setComments(c)
    } catch {}
  }, [article])

  /** 局部刷新文章（更新 comment_count 等） */
  const refreshArticle = useCallback(async () => {
    if (!slug) return
    try {
      const a = await fetchPlazaArticle(slug)
      setArticle(a)
    } catch {}
  }, [slug])

  const handleNewComment = async (content: string, parentId?: string) => {
    if (!article) return
    try {
      await addPlazaComment(article.id, content, parentId)
      await Promise.all([refreshComments(), refreshArticle()])
    } catch (e: any) { showWarningToast(e?.message || '评论失败') }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deletePlazaComment(commentId)
      await Promise.all([refreshComments(), refreshArticle()])
    } catch (e: any) { showWarningToast(e?.message || '删除失败') }
  }

  /** 手动刷新评论（10s 冷却） */
  const handleRefreshComments = useCallback(async () => {
    if (refreshCooldown > 0) return
    setSpinning(true)
    setRefreshCooldown(10)
    await refreshComments()
    setSpinning(false)
    const timer = setInterval(() => {
      setRefreshCooldown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [refreshCooldown, refreshComments])

  // 提取标题用于 TOC（必须在早期 return 之前，保证 hooks 数量一致）
  const articleHtml = useMemo(() => {
    if (!article?.content) return ''
    try {
      const md = createClientMd({ highlight: true, texmath: true, anchor: true })
      return md.render(article.content)
    } catch { return '' }
  }, [article?.content])

  const headings: Heading[] = useMemo(
    () => extractHeadingsFromHtml(articleHtml),
    [articleHtml],
  )

  const unifiedComments = useMemo(() => comments.map((c): UnifiedComment => ({
    id: c.id,
    parentId: c.parent_id ?? null,
    author: c.author_username,
    authorId: c.author_id,
    content: c.content,
    createdAt: c.created_at,
    deleted: c.deleted,
  })), [comments])

  if (!slug) return <div className={styles.page}><p className={styles.loading}>缺少文章标识</p></div>
  if (loading) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
  if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
  if (!article) return <div className={styles.page}><p className={styles.error}>❌ 文章不存在</p></div>

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
                  <button
                    className={styles.backBtnIcon}
                    onClick={handleDelete}
                    title="删除文章"
                    style={{ color: '#dc2626' }}
                  >
                    <FaIcon name="times" />
                  </button>
                </>
              )}
              <button
                className={styles.backBtnIcon}
                onClick={editing ? cancelEdit : () => router.push('/plaza')}
                title={editing ? '取消编辑' : '返回列表'}
              >
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
          <div className={styles.detailMeta}>
            <UserName username={article.author_username} className={styles.detailAuthor} />
            <span>发布于 {formatDate(article.created_at)}</span>
            {article.updated_at !== article.created_at && (
              <span>编辑于 {formatDate(article.updated_at)}</span>
            )}
            <span style={{ color: 'var(--color-text-light)' }}>
              {article.category}{article.sub_category ? ` · ${article.sub_category}` : ''}
            </span>
            {!article.is_public && (
              <span style={{ color: '#b35a00', fontSize: '0.82rem' }}>🔒 私密</span>
            )}
            {editing && <span style={{ color: 'var(--color-primary)' }}>编辑中</span>}
          </div>
        </div>
      </div>

      <div className={styles.page} style={{ paddingTop: 0 }}>
        {editing ? (
          <div className={styles.newPostForm}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                可见性
              </span>
              <div
                className={styles.toggleSwitch + (editIsPublic ? '' : ' ' + styles.toggleOn)}
                onClick={() => setEditIsPublic(!editIsPublic)}
                role="switch"
                aria-checked={editIsPublic}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditIsPublic(!editIsPublic) } }}
              >
                <div className={styles.toggleSlider} />
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
                {editIsPublic ? '公开（所有人可见）' : '私密（仅自己可见）'}
              </span>
            </div>

            <div className={styles.editorWrapper} style={{ minHeight: '300px' }}>
              <MarkdownEditor value={editContent} onChange={setEditContent} className={styles.editorNoBorder} />
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
          <div className={styles.detail}>
            <div className={styles.detailBody}>
              <WikiContent content={article.content} className="wiki-body" />
            </div>

            {/* 点赞栏 */}
            <div className={styles.voteBar}>
              <button className={`${styles.voteIcon} ${myVote === 'up' ? styles.voteIconActiveUp : ''}`}
                onClick={() => handleVote('up')} title="赞"><FaIcon name="thumbs-up" /></button>
              <span className={`${styles.voteCount} ${(article.like_count ?? 0) > 0 ? styles.voteCountPositive : ''}`}>{article.like_count ?? 0}</span>
              <button className={`${styles.voteIcon} ${myVote === 'down' ? styles.voteIconActiveDown : ''}`}
                onClick={() => handleVote('down')} title="踩"><FaIcon name="thumbs-down" /></button>
              <span className={`${styles.voteCount} ${(article.downvote_count ?? 0) > 0 ? styles.voteCountNegative : ''}`}>{article.downvote_count ?? 0}</span>
            </div>

            {/* 评论区 */}
            <div className={styles.commentSectionHeader}>
              <h3 className={styles.commentSectionTitle}>💬 评论</h3>
              <button
                className={`${styles.refreshBtn} ${refreshCooldown > 0 ? styles.refreshBtnCooling : ''}`}
                onClick={handleRefreshComments}
                disabled={refreshCooldown > 0}
                title={refreshCooldown > 0 ? `${refreshCooldown}s 后可刷新` : '刷新评论'}
              >
                <FaIcon name="sync-alt" spin={spinning} />
                {refreshCooldown > 0 && <span className={styles.refreshCooldown}>{refreshCooldown}s</span>}
              </button>
            </div>
            <CommentSection
              comments={unifiedComments}
              onSubmit={handleNewComment}
              onDelete={handleDeleteComment}
              hideTitle
            />
          </div>
        )}
      </div>

      {/* TOC */}
      <TableOfContents headings={headings} />
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
