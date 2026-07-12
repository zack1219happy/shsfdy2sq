import { notFound } from 'next/navigation'
import { getAgreementContent } from '@/lib/content'
import { getAgreementTree, getAllSlugs as getWikiSlugs, type NavNode } from '@/lib/navigation'
import TableOfContents from '@/components/TableOfContents'

interface Props {
  params: Promise<{ slug?: string[] }>
}

export async function generateStaticParams() {
  // 扫描 agreement 目录获取 slug
  const tree = getAgreementTree()
  const slugs: string[][] = [[]]
  function walk(nodes: NavNode[], prefix: string[] = []) {
    for (const node of nodes) {
      if (node.type === 'page' && node.pathKey) {
        slugs.push(node.pathKey.split('/'))
      }
      if (node.children) walk(node.children, [...prefix, node.id])
    }
  }
  walk(tree)
  return slugs.map((slug) => ({ slug }))
}

export default async function AgreementPage({ params }: Props) {
  const { slug } = await params

  const content = getAgreementContent(slug ?? [])

  if (slug && !slug.length && content.title === '未找到') {
    // 如果连 index.md 都没有，返回 404
    notFound()
  }

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
        <h2
          style={{
            fontSize: '1.8rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            padding: '32px 0 16px',
          }}
          dangerouslySetInnerHTML={{ __html: content.titleHtml }}
        />

        <div className="wiki-body" dangerouslySetInnerHTML={{ __html: content.html }} />
      </article>

      <TableOfContents headings={content.headings} />
    </div>
  )
}
