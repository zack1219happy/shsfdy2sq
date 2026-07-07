import { notFound } from 'next/navigation'
import { getAllSlugs, findNodeBySlug, getBreadcrumbs } from '@/lib/navigation'
import { getPageContent } from '@/lib/content'
import Breadcrumb from '@/components/Breadcrumb'
import AttributeBox from '@/components/AttributeBox'
import TableOfContents from '@/components/TableOfContents'
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
          padding: '0 24px 60px',
          flex: 1,
        }}
      >
        <h2
          style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            padding: '32px 0 16px',
          }}
        >
          {node.title}
        </h2>

        <Breadcrumb crumbs={crumbs} />
        <AttributeBox attributes={content.attributes} />

        <div className="wiki-body" dangerouslySetInnerHTML={{ __html: content.html }} />
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
