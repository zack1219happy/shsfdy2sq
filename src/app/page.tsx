'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import WikiContent from '@/components/WikiContent'
import { getSession } from '@/lib/auth'
import { fetchForumPosts } from '@/lib/gist-api'
import type { ForumPost } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import styles from '@/styles/home.module.css'

export default function HomePage() {
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    Promise.all([
      fetchForumPosts().then((data) => {
        const session = getSession()
        const userId = session?.userId
        const visible = userId
          ? data.filter((p) => !p.excluded_visibility?.includes(userId))
          : data
        setPosts(visible.slice(0, 5))
      }),
      fetch(`${base}/data/announcement.md?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => r.ok ? r.text() : '')
        .then((text) => {
          // 剥离 YAML frontmatter
          const body = text.replace(/^---[\s\S]*?---\n?/, '').trim()
          setAnnouncement(body)
        })
    ]).finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>上中初二 Wiki</h1>
        <p className={styles.heroSubtitle}>上海中学 2027 届 8 班 · 班级知识库</p>
        <div className={styles.heroNav}>
          <Link href="/wiki" className={styles.heroLink}><FaIcon name="book" /> 知识库</Link>
          <Link href="/forum" className={styles.heroLink}><FaIcon name="comments" /> 讨论区</Link>
          <Link href="/user" className={styles.heroLink}><FaIcon name="user" /> 个人设置</Link>
          <Link href="/notice" className={styles.heroLink}><FaIcon name="bell" /> 通知</Link>
        </div>
      </header>

      {announcement && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><FaIcon name="bullhorn" /> 公告</h2>
          <div className={styles.announcementCard}>
            <WikiContent format="markdown" content={announcement} className="wiki-body" />
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><FaIcon name="comments" /> 最新讨论</h2>
        {loading ? (
          <p className={styles.status}>加载中…</p>
        ) : posts.length === 0 ? (
          <p className={styles.status}>暂无帖子</p>
        ) : (
          <div className={styles.postList}>
            {posts.map((post) => (
              <Link key={post.id} href={`/forum/post?id=${post.id}`} className={styles.postCard}>
                <span className={styles.postTitle}>{post.title}</span>
                <span className={styles.postMeta}>
                  <UserName username={post.author_username} /> · {formatDate(post.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}><FaIcon name="star" /> 每日运势</h2>
        <div className={styles.placeholderCard}>
          <p>运势打卡功能即将上线 🚀</p>
        </div>
      </section>
    </div>
  )
}
