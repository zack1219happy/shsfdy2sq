'use client'

import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/sidebar.module.css'

const ENTRIES = [
  { href: '/notice',          icon: 'bell',      label: '全部通知' },
  { href: '/notice?type=forum_reply',   icon: 'reply',    label: '论坛回复' },
  { href: '/notice?type=forum_post_update', icon: 'pen', label: '关注更新' },
] as const

interface Props {
  collapsed: boolean
}

export default function NoticeNav({ collapsed }: Props) {
  return (
    <ul className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
      <li className={styles.treeSectionLabel}>
        {!collapsed && <span className={styles.sectionTitle}>通知</span>}
      </li>
      {ENTRIES.map((entry) => (
        <li key={entry.href} className={styles.treeNode}>
          <Link
            href={entry.href}
            className={styles.nodeContent}
            style={{ paddingLeft: `${8 + (collapsed ? 0 : 0)}px`, textDecoration: 'none', color: 'inherit' }}
          >
            <span className={styles.spacer} />
            <FaIcon name={entry.icon} className={styles.treeIcon} title={collapsed ? entry.label : undefined} />
            {!collapsed && <span className={styles.treeTitle}>{entry.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
