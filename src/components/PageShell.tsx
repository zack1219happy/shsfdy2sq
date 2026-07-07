import type { ReactNode } from 'react'
import type { Heading } from '@/lib/content'
import TableOfContents from './TableOfContents'

interface Props {
  children: ReactNode
  headings?: Heading[]
}

/**
 * 页面外壳：主内容 + 右侧目录（三栏布局中的第二和第三栏）
 */
export default function PageShell({ children, headings = [] }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '40px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      <article style={{ maxWidth: '800px', flex: 1, minWidth: 0 }}>
        {children}
      </article>
      <TableOfContents headings={headings} />
    </div>
  )
}
