import type { Metadata } from 'next'
import { getNavTree, getSiteTitle } from '@/lib/navigation'
import Sidebar from '@/components/Sidebar'
import ImageModal from '@/components/ImageModal'
import '@fortawesome/fontawesome-free/css/all.min.css'
import '@/styles/globals.css'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getSiteTitle(),
    description: '上中初二 Wiki - 班级内部知识库',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tree = getNavTree()
  const siteTitle = getSiteTitle()

  return (
    <html lang="zh-CN">
      <head />
      <body>
        <Sidebar tree={tree} siteTitle={siteTitle} />

        <ImageModal />

        <div
          style={{
            marginLeft: 'var(--sidebar-actual-width, var(--sidebar-width))',
            minHeight: '100vh',
          }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}
