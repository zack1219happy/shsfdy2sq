import { notFound } from 'next/navigation'
import AgreementContentDB from '@/components/AgreementContentDB'
import TableOfContents from '@/components/TableOfContents'
import { renderMarkdownAndGetHeadings, type Heading } from '@/lib/content'
import { supabase } from '@/lib/supabase'

interface Props {
  params: Promise<{ slug?: string[] }>
}

interface AgreementPageSSG {
  slug: string
  title: string
  content: string
}

interface StaticFallback {
  title: string
  rawContent: string
  slug: string
  headings: Heading[]
}

async function getDBSlugs(): Promise<string[]> {
  try {
    const { data } = await supabase.rpc('get_agreement_slugs')
    return (data ?? []).map((r: any) => r.slug)
  } catch {
    return []
  }
}

async function getDBContent(slug: string): Promise<AgreementPageSSG | null> {
  try {
    const { data } = await supabase.rpc('get_agreement_page', { p_slug: slug })
    const rows = (data ?? []) as AgreementPageSSG[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

export async function generateStaticParams() {
  const dbSlugs = await getDBSlugs()
  const params: { slug: string[] }[] = []
  for (const s of dbSlugs) {
    if (s === 'index') {
      params.push({ slug: [] })
      params.push({ slug: ['index'] })
    } else {
      params.push({ slug: [s] })
    }
  }
  return params
}

async function getStaticFallback(slug: string[]): Promise<StaticFallback> {
  const slugPath = slug.length === 0 ? 'index' : slug.join('/')
  const db = await getDBContent(slugPath)

  const title = db?.title ?? '协议与帮助'
  const rawContent = db?.content ?? ''

  // 渲染 markdown 并提取标题供 TOC 使用
  let headings: Heading[] = []
  if (rawContent) {
    const rendered = renderMarkdownAndGetHeadings(rawContent)
    headings = rendered.headings
  }

  return { title, rawContent, slug: slugPath, headings }
}

export default async function AgreementPage({ params }: Props) {
  const { slug } = await params
  const slugPath = slug?.length ? slug.join('/') : 'index'

  const staticContent = await getStaticFallback(slug ?? [])

  if (!slug?.length && !staticContent.rawContent) {
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
        <AgreementContentDB
          slug={slugPath}
          staticContent={staticContent.rawContent}
          staticTitle={staticContent.title}
        />
      </article>

      <TableOfContents headings={staticContent.headings} />
    </div>
  )
}
