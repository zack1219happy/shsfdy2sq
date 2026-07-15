import { notFound } from 'next/navigation'
import { fetchWikiPage, fetchWikiSlugs } from '@/lib/wiki-api'
import { renderMarkdownAndGetHeadings, renderAttributesFromFrontmatter, renderInlineTitle } from '@/lib/content'
import Breadcrumb from '@/components/Breadcrumb'
import AttributeBox from '@/components/AttributeBox'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import WikiEditPanel from '@/components/WikiEditPanel'
import WikiContentDB from '@/components/WikiContentDB'
import type { NavNode } from '@/lib/navigation'

interface Props {
  params: Promise<{ slug: string[] }>
}

export async function generateStaticParams() {
  const slugs = await fetchWikiSlugs()
  return slugs.map((slug) => ({ slug: slug.split('/') }))
}

/** 从 slug 路径构建面包屑 */
function buildBreadcrumbs(slugPath: string): NavNode[] {
  const segments = slugPath.split('/')
  const crumbs: NavNode[] = [{ id: 'home', title: '首页', type: 'page', pathKey: 'home' }]
  let path = ''
  for (const seg of segments) {
    path = path ? `${path}/${seg}` : seg
    crumbs.push({ id: seg, title: seg, type: 'page', pathKey: path })
  }
  return crumbs
}

export default async function WikiPage({ params }: Props) {
  const { slug } = await params
  const slugPath = slug.join('/')

  // 从 DB 加载页面内容
  const page = await fetchWikiPage(slugPath)
  if (!page) notFound()

  // 渲染 markdown 提取标题（TOC）
  const { headings } = renderMarkdownAndGetHeadings(page.content)

  // 从 frontmatter 渲染属性表
  const attributes = renderAttributesFromFrontmatter((page.frontmatter ?? {}) as Record<string, unknown>)

  // 面包屑
  const crumbs = buildBreadcrumbs(slugPath)

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
            dangerouslySetInnerHTML={{ __html: renderInlineTitle(page.title) }}
          />
          <WikiEditPanel slug={slugPath} />
        </div>

        <Breadcrumb crumbs={crumbs} baseHref="/wiki" />
        <AttributeBox attributes={attributes} />

        <WikiContentDB slug={slugPath} staticContent={page.content} />

        <CommentSection pageSlug={slugPath} />
      </article>

      <TableOfContents headings={headings} />
    </div>
  )
}
