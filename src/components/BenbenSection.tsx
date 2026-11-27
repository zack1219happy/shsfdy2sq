'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import { UserName } from '@/components/UserName'
import { createBenben, deleteBenben, fetchBenbenFeed, toggleBenbenLike } from '@/lib/api/benben'
import { formatDate } from '@/lib/forum'
import { showWarningToast } from '@/lib/toast'
import { BENBEN_MAX_LENGTH, type BenbenPost } from '@/types/benben'
import styles from '@/styles/benben.module.css'

/** CodeMirror 不能 SSR，和评论区一样按需加载 */
const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className={styles.editorLoading}>加载编辑器…</div> },
)

/* ==============================================================
   犇犇 — 首页底部的碎碎念

   一条犇犇 = 一段 Markdown（支持 [[…]]、@、表情包）。
   点「回复」会把整条犇犇作为引用行 `|| @作者: 内容` 追加到编辑器。
   发一条 +1 积分由数据库侧完成，前端不展示积分。
   ============================================================== */

export default function BenbenSection() {
  const [draft, setDraft] = useState('')
  const [posts, setPosts] = useState<BenbenPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)

  /** 首页不该被一个失败的接口刷红，这里失败就安静地显示一行提示 */
  const loadFeed = () =>
    fetchBenbenFeed()
      .then((next) => {
        setPosts(next)
        setError(false)
      })
      .catch((e: unknown) => {
        setError(true)
        console.warn('[Benben] 加载失败', e)
      })
      .finally(() => setLoading(false))

  useEffect(() => {
    void loadFeed()
  }, [])

  /** 发射 / 删除后重新拉一次列表（不经过 loading 态，避免闪烁） */
  const refreshFeed = () => loadFeed()

  const tooLong = draft.length > BENBEN_MAX_LENGTH
  const canSubmit = draft.trim().length > 0 && !tooLong && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await createBenben(draft)
      setDraft('')
      await refreshFeed()
    } catch (e) {
      showWarningToast(e instanceof Error ? e.message : '发射失败')
    } finally {
      setSubmitting(false)
    }
  }

  /** 把整条犇犇搬进编辑器，作为引用行接在最后 */
  const handleReply = (post: BenbenPost) => {
    const quoted = post.content.replace(/\s+/g, ' ').trim()
    const line = `|| @${post.author_username}: ${quoted}`
    setDraft((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${line}` : line))
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleLike = async (post: BenbenPost) => {
    try {
      const liked = await toggleBenbenLike(post.id)
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) }
            : p,
        ),
      )
    } catch (e) {
      showWarningToast(e instanceof Error ? e.message : '操作失败')
    }
  }

  const handleDelete = async (post: BenbenPost) => {
    if (!window.confirm('删除这条犇犇？')) return
    try {
      await deleteBenben(post.id)
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
    } catch (e) {
      showWarningToast(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        <FaIcon name="laugh-beam" /> 犇犇
      </h2>

      {/* 发射区 */}
      <div className={styles.composer} ref={composerRef}>
        <div className={styles.editorWrap}>
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            className={styles.editorInner}
          />
        </div>
        <div className={styles.composerBar}>
          <span className={styles.hint}>支持 Markdown、@ 和表情包，Ctrl/⌘ + Enter 发射</span>
          <span className={`${styles.counter} ${tooLong ? styles.counterOver : ''}`}>
            {draft.length} / {BENBEN_MAX_LENGTH}
          </span>
          <button className={styles.submit} onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? '发射中…' : '发射'}
          </button>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <p className={styles.status}>加载中…</p>
      ) : error ? (
        <p className={styles.status}>
          犇犇暂时加载不出来
          <button className={styles.retry} onClick={() => { setLoading(true); void loadFeed() }}>
            重试
          </button>
        </p>
      ) : posts.length === 0 ? (
        <p className={styles.status}>还没有犇犇，来发射第一条吧</p>
      ) : (
        <div className={styles.feed}>
          {posts.map((post) => (
            <article key={post.id} className={styles.post}>
              <div className={styles.postMeta}>
                <UserName username={post.author_username} userId={post.author_id} />
                <span className={styles.time}>{formatDate(post.created_at)}</span>
              </div>

              <div className={styles.body}>
                <WikiContent
                  content={post.content}
                  contextUserId={post.author_id}
                  className="wiki-body"
                />
              </div>

              <div className={styles.actions}>
                <button
                  className={`${styles.action} ${post.liked_by_me ? styles.actionOn : ''}`}
                  onClick={() => void handleLike(post)}
                  title={post.liked_by_me ? '取消赞' : '赞'}
                >
                  <FaIcon name="thumbs-up" />
                  {post.like_count > 0 && <span>{post.like_count}</span>}
                </button>
                <button className={styles.action} onClick={() => handleReply(post)} title="回复">
                  <FaIcon name="reply" /> 回复
                </button>
                {post.can_delete && (
                  <button className={styles.danger} onClick={() => void handleDelete(post)}>
                    删除
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
