'use client'

import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/sidebar.module.css'

interface Props {
  collapsed: boolean
}

export default function UserNav({ collapsed }: Props) {
  return (
    <div className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
      <div className={styles.treeSectionLabel}>
        {!collapsed && <span className={styles.sectionTitle}>设置</span>}
      </div>
      <div className={styles.treeNode}>
        <Link
          href="/user"
          className={styles.nodeContent}
          style={{ paddingLeft: `${8 + (collapsed ? 0 : 0)}px`, textDecoration: 'none', color: 'inherit' }}
        >
          {!collapsed && <span className={styles.spacer}>-</span>}
          <FaIcon name="user" className={styles.treeIcon} title={collapsed ? '账号设置' : undefined} />
          {!collapsed && <span className={styles.treeTitle}>账号设置</span>}
        </Link>
      </div>
    </div>
  )
}
