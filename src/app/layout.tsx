import type { Metadata } from 'next'
import fs from 'fs'
import path from 'path'
import { getNavTree, getSiteTitle } from '@/lib/navigation'
import Sidebar from '@/components/Sidebar'
import ImageModal from '@/components/ImageModal'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
// 阻止 FA 自动注入 CSS（Next.js 已手动导入）
config.autoAddCss = false
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

  // 公告内容在构建时编译，无需客户端 fetch
  let announcementContent = ''
  try {
    announcementContent = fs.readFileSync(
      path.join(process.cwd(), 'data', 'announcement.md'),
      'utf-8',
    )
  } catch {
    announcementContent = '⚠️ 公告加载失败'
  }

  return (
    <html lang="zh-CN">
      <head />
      <body>
        <Sidebar tree={tree} siteTitle={siteTitle} announcement={announcementContent} />

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
