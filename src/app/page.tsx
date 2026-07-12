'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import WikiContent from '@/components/WikiContent'
import FortuneCard from '@/components/FortuneCard'
import { getSession } from '@/lib/auth'
import { fetchForumPosts } from '@/lib/gist-api'
import type { ForumPost } from '@/types/gist'
import { formatDate } from '@/lib/forum'
import { titleSlugMap } from '@/data/person-registry'
import styles from '@/styles/home.module.css'

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const result: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length)
    result.push(copy[idx])
    copy.splice(idx, 1)
  }
  return result
}

export default function HomePage() {
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [loading, setLoading] = useState(true)
  const [randomPages, setRandomPages] = useState<{ title: string; slug: string }[]>([])

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
        .then((r) => (r.ok ? r.text() : ''))
        .then((text) => {
          const body = text.replace(/^---[\s\S]*?---\n?/, '').trim()
          setAnnouncement(body)
        }),
    ]).finally(() => setLoading(false))

    // 随机选取 3 个 wiki 页面
    const entries = Object.entries(titleSlugMap).filter(
      ([title, slug]) => slug !== 'people',
    )
    setRandomPages(
      pickRandom(entries, 3).map(([title, slug]) => ({ title, slug })),
    )
  }, [])

  return (
    <div className={styles.page}>
      {/* ═══ 第一行：Logo + 标题 ═══ */}
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.webp`}
            alt="Logo"
            className={styles.logo}
          />
          上中初二 Wiki
        </h1>
        <p className={styles.heroSubtitle}>上海中学 2027 届 8 班 · 班级知识库</p>
      </header>

      {/* ═══ 第二行：两栏 — 公告 | 运势抽卡 ═══ */}
      <div className={styles.twoCol}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <FaIcon name="bullhorn" /> 公告
          </h2>
          {announcement ? (
            <div className={`${styles.card} ${styles.announcementCard}`}>
              <WikiContent
                format="markdown"
                content={announcement}
                className="wiki-body"
              />
            </div>
          ) : (
            <div className={styles.card}>
              <p className={styles.emptyState}>暂无公告</p>
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <FaIcon name="star" /> 运势抽卡
          </h2>
          <FortuneCard />
        </section>
      </div>

      {/* ═══ 第三行：两栏 — 最新帖子 | 随机 Wiki 页面 ═══ */}
      <div className={styles.twoCol}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <FaIcon name="comments" /> 最新帖子
          </h2>
          <div className={styles.card}>
            {loading ? (
              <p className={styles.status}>加载中…</p>
            ) : posts.length === 0 ? (
              <p className={styles.status}>暂无帖子</p>
            ) : (
              <div className={styles.list}>
                {posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/forum/post?id=${post.id}`}
                    className={styles.listItem}
                  >
                    <span className={styles.itemTitle}>{post.title}</span>
                    <span className={styles.itemMeta}>
                      <UserName username={post.author_username} /> ·{' '}
                      {formatDate(post.created_at)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <FaIcon name="dice" /> 随机 Wiki 页面
          </h2>
          <div className={styles.card}>
            {randomPages.length === 0 ? (
              <p className={styles.status}>加载中…</p>
            ) : (
              <div className={styles.list}>
                {randomPages.map((page) => (
                  <Link
                    key={page.slug}
                    href={`/wiki/${page.slug}`}
                    className={styles.listItem}
                  >
                    <span className={styles.wikiTitle}>· {page.title}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
