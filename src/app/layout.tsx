import type { Metadata } from 'next'
import { getSiteTitle, getNavTree } from '@/lib/navigation'
import Sidebar from '@/components/Sidebar'
import FilePad from '@/components/FilePad'
import AuthGate from '@/components/AuthGate'
import ImageModal from '@/components/ImageModal'
import ToastProvider from '@/components/ToastProvider'
import ExternalLinkHandler from '@/components/ExternalLinkHandler'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
// 阻止 FA 自动注入 CSS（Next.js 已手动导入）
config.autoAddCss = false
import '@/styles/globals.css'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: getSiteTitle(),
    description: '上中二旦社区 - 班级内部知识库',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tree = getNavTree()

  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://iiiyoafpzfqxpaqheojg.supabase.co" />
        <link rel="dns-prefetch" href="https://iiiyoafpzfqxpaqheojg.supabase.co" />
      </head>
      <body>
        <ToastProvider>
          <ExternalLinkHandler>
          <Sidebar />
          <FilePad tree={tree} />

          <ImageModal />

          <AuthGate>
          <div
            style={{
              marginLeft: 'calc(var(--sidebar-width) + var(--filepad-width, 0px))',
              minHeight: '100vh',
            }}
          >
            {children}
          </div>
        </AuthGate>
          </ExternalLinkHandler>
          </ToastProvider>
      </body>
    </html>
  )
}
