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
          <img src={`${BASE_PATH}/logo.webp`} alt="" className={styles.logo} />
        </Link>
      </div>

      <NavEntries />
    </div>
  )
}
