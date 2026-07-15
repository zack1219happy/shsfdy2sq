import { fetchWikiPage } from '@/lib/wiki-api'
import { renderMarkdownAndGetHeadings, renderAttributesFromFrontmatter, renderInlineTitle } from '@/lib/content'
import Breadcrumb from '@/components/Breadcrumb'
import AttributeBox from '@/components/AttributeBox'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import WikiEditPanel from '@/components/WikiEditPanel'
import WikiContentDB from '@/components/WikiContentDB'
import type { NavNode } from '@/lib/navigation'

const homeCrumb: NavNode[] = [{ id: 'home', title: '首页', type: 'page', pathKey: 'home' }]

export default async function WikiHomePage() {
  // 从 DB 加载首页内容
  const page = await fetchWikiPage('home')
  const content = page?.content ?? ''
  const title = page?.title ?? '首页'
  const frontmatter = (page?.frontmatter ?? {}) as Record<string, unknown>

  const { headings } = content ? renderMarkdownAndGetHeadings(content) : { headings: [] }
  const attributes = renderAttributesFromFrontmatter(frontmatter)

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
            dangerouslySetInnerHTML={{ __html: renderInlineTitle(title) }}
          />
          <WikiEditPanel slug="home" />
        </div>

        <Breadcrumb crumbs={homeCrumb} baseHref="/wiki" />
        <AttributeBox attributes={attributes} />

        <WikiContentDB slug="home" staticContent={content} />

        <CommentSection pageSlug="home" />
      </article>

      <TableOfContents headings={headings} />
    </div>
  )
}
