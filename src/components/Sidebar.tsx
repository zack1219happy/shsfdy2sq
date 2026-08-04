'use client'

import Link from 'next/link'
import NavEntries from './sidebar/NavEntries'
import { BASE_PATH } from '@/lib/constants'
import styles from '@/styles/sidebar.module.css'

export default function Sidebar() {
  return (
    <div className={styles.sidebar} style={{ '--sidebar-actual-width': '60px' } as React.CSSProperties}>
      {/* 顶部 logo */}
      <div className={styles.topSection}>
        <Link href="/" className={styles.logoLink}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 尺寸由 CSS 控制且 images.unoptimized 已关闭优化，next/image 会引入额外包装元素影响布局 */}
          <img src={`${BASE_PATH}/logo.webp`} alt="" className={styles.logo} />
        </Link>
      </div>

      <NavEntries />
    </div>
  )
}
