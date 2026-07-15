import { notFound } from 'next/navigation'
import { getAllSlugs, findNodeBySlug, getBreadcrumbs } from '@/lib/navigation'
import { getPageContent } from '@/lib/content'
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
  return getAllSlugs().map((slug) => ({ slug }))
}

function WikiArticle({ node, slug }: { node: NavNode; slug: string[] }) {
  const slugPath = slug.join('/')
  const content = getPageContent(slug)
  const crumbs = getBreadcrumbs(slugPath)

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
            dangerouslySetInnerHTML={{ __html: content.titleHtml }}
          />
          <WikiEditPanel slug={slugPath} />
        </div>

        <Breadcrumb crumbs={crumbs} baseHref="/wiki" />
        <AttributeBox attributes={content.attributes} />

        <WikiContentDB slug={slugPath} staticContent={content.rawContent} />

        <CommentSection pageSlug={slugPath} />
      </article>

      <TableOfContents headings={content.headings} />
    </div>
  )
}

export default async function WikiPage({ params }: Props) {
  const { slug } = await params
  const slugPath = slug.join('/')

  const node = findNodeBySlug(slugPath)
  if (!node) {
    notFound()
  }

  return <WikiArticle node={node} slug={slug} />
}
