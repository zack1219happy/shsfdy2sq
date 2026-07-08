import { getPageContent } from '@/lib/content'
import { getBreadcrumbs } from '@/lib/navigation'
import Breadcrumb from '@/components/Breadcrumb'
import AttributeBox from '@/components/AttributeBox'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'

export default function HomePage() {
  const content = getPageContent([])
  const crumbs = getBreadcrumbs('home')

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
          {content.title}
        </h2>

        <Breadcrumb crumbs={crumbs} />
        <AttributeBox attributes={content.attributes} />

        <div className="wiki-body" dangerouslySetInnerHTML={{ __html: content.html }} />

        <CommentSection pageSlug="home" />
      </article>

      <TableOfContents headings={content.headings} />
    </div>
  )
}
