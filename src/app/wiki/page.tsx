import { getPageContent } from '@/lib/content'
import { getBreadcrumbs } from '@/lib/navigation'
import Breadcrumb from '@/components/Breadcrumb'
import AttributeBox from '@/components/AttributeBox'
import TableOfContents from '@/components/TableOfContents'
import CommentSection from '@/components/CommentSection'
import WikiEditPanel from '@/components/WikiEditPanel'
import WikiContentDB from '@/components/WikiContentDB'

export default function WikiHomePage() {
  const content = getPageContent([])
  const crumbs = getBreadcrumbs('home')

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
          <WikiEditPanel slug="home" />
        </div>

        <Breadcrumb crumbs={crumbs} baseHref="/wiki" />
        <AttributeBox attributes={content.attributes} />

        <WikiContentDB slug="home" staticContent={content.rawContent} />

        <CommentSection pageSlug="home" />
      </article>

      <TableOfContents headings={content.headings} />
    </div>
  )
}
