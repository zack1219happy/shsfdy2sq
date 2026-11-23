'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchWikiPage } from '@/lib/wiki-api'
import { renderMarkdown, renderAttributesFromFrontmatter } from '@/lib/markdown'
import { resolveTextHtml } from '@/lib/people'
import { usePersonRegistry } from '@/lib/person-registry-source'
import { BASE_PATH } from '@/lib/constants'
import WikiContent from '@/components/WikiContent'
import Breadcrumb from '@/components/Breadcrumb'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import WikiEditPanel from '@/components/WikiEditPanel'
import AttributeBox from '@/components/AttributeBox'
import type { WikiPage } from '@/lib/wiki-api'
import type { NavNode } from '@/lib/navigation'

/* ==============================================================
   Wiki 页面路由 — /wiki/page?slug=xxx
   - 完全客户端渲染，数据从 Supabase 实时拉取
   - 更新数据后只需刷新页面即可看到最新内容
   ============================================================== */

export default function WikiPageWrapper() {
  return (
    <Suspense fallback={<LoadingState />}>
      <WikiPageBySlug />
    </Suspense>
  )
}

interface Heading {
  id: string
  text: string
  level: number
}

/** 从 slug 构建面包屑导航 */
function buildBreadcrumbs(slugPath: string): NavNode[] {
  const segments = slugPath.split('/')
  const crumbs: NavNode[] = [{ id: 'home', title: '首页', type: 'page', pathKey: '' }]
  let path = ''
  for (const seg of segments) {
    if (seg === 'home' && segments.length === 1) continue
    path = path ? `${path}/${seg}` : seg
    crumbs.push({ id: seg, title: seg, type: 'page', pathKey: `page?slug=${path}` })
  }
  return crumbs
}

/** 从渲染后的 HTML 提取标题（与 content.ts 的 extractHeadingsFromHtml 逻辑相同，但纯客户端可用） */
function extractHeadingsFromHtml(html: string): Heading[] {
  const headings: Heading[] = []
  const regex = /<h([23])\s+id="([^"]*)"[^>]*>(.*?)<\/h\1>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      id: match[2],
      text: match[3].replace(/<[^>]*>/g, '').trim(),
    })
  }
  return headings
}

/** 状态：加载中 */
function LoadingState() {
  return (
    <div className="page-content" style={{ display: 'flex', gap: '24px' }}>
      <article style={{ maxWidth: '800px', margin: '0 auto', padding: '76px 24px 60px', flex: 1 }}>
        <p>加载中…</p>
      </article>
    </div>
  )
}

/** 状态：页面不存在 */
function NotFoundState() {
  return (
    <div className="page-content" style={{ display: 'flex', gap: '24px' }}>
      <article style={{ maxWidth: '800px', margin: '0 auto', padding: '76px 24px 60px', flex: 1 }}>
        <h2>404</h2>
        <p>页面不存在</p>
      </article>
    </div>
  )
}

function WikiPageBySlug() {
  const searchParams = useSearchParams()
  const slug = searchParams.get('slug') || ''
  const [page, setPage] = useState<WikiPage | null | 'loading'>('loading')
  // 注册表运行时刷新：标题里的 [stu:x] 按最新数据解析
  const liveRegistry = usePersonRegistry()

  // 渲染期重置加载态（slug 变化时切回加载态，避免在 effect 中同步 setState）
  const [prevSlug, setPrevSlug] = useState(slug)
  if (prevSlug !== slug) {
    setPrevSlug(slug)
    setPage('loading')
  }

  // 根据 slug 从 Supabase 拉取页面内容
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetchWikiPage(slug)
      .then((p) => { if (!cancelled) setPage(p ?? null) })
      .catch(() => { if (!cancelled) setPage(null) })
    return () => { cancelled = true }
  }, [slug])

  // 将 markdown 预渲染为 HTML 并提取标题（用于 TOC）
  const headings = useMemo(() => {
    if (typeof page !== 'object' || !page) return [] as Heading[]
    const html = renderMarkdown(page.content, { anchor: true, highlight: false, texmath: false })
    return extractHeadingsFromHtml(html)
  }, [page])

  // 无 slug 或 页面不存在
  if (!slug) return <NotFoundState />
  if (page === 'loading') return <LoadingState />
  if (page === null) return <NotFoundState />

  const frontmatter = (page.frontmatter ?? {}) as Record<string, unknown>
  const attributes = renderAttributesFromFrontmatter(frontmatter)
  const crumbs = buildBreadcrumbs(slug)
  const resolvedTitle = resolveTextHtml(page.title, liveRegistry, BASE_PATH)

  return (
    <div className="page-content" style={{ display: 'flex', gap: '24px' }}>
      <article
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: '76px 24px 60px',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            padding: '32px 0 16px',
          }}
        >
          <h2
            style={{
              fontSize: '1.8rem',
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
            dangerouslySetInnerHTML={{ __html: resolvedTitle }}
          />
          <WikiEditPanel slug={slug} />
        </div>

        <Breadcrumb crumbs={crumbs} baseHref="/wiki" />
        <AttributeBox attributes={attributes} />

        <WikiContent content={page.content} className="wiki-body" slug={slug} />

        <CommentSection source="wiki" targetId={slug} />
      </article>

      {headings.length > 0 && <TableOfContents headings={headings} />}
    </div>
  )
}
