'use client'

import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/sidebar.module.css'

const ENTRIES = [
  { href: '/forum',          icon: 'comments', label: '论坛主页' },
  { href: '/forum?my=1',     icon: 'user',     label: '我的帖子' },
  { href: '/forum?liked=1',  icon: 'thumbs-up', label: '我赞的帖子' },
] as const

interface Props {
  collapsed: boolean
}

export default function ForumNav({ collapsed }: Props) {
  return (
    <ul className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
      <li className={styles.treeSectionLabel}>
        {!collapsed && <span className={styles.sectionTitle}>讨论区</span>}
      </li>
      {ENTRIES.map((entry) => (
        <li key={entry.href} className={styles.treeNode}>
          <Link
            href={entry.href}
            className={styles.nodeContent}
            style={{ paddingLeft: `${8 + (collapsed ? 0 : 0)}px`, textDecoration: 'none', color: 'inherit' }}
          >
            {!collapsed && <span className={styles.spacer} />}
            <FaIcon name={entry.icon} className={styles.treeIcon} title={collapsed ? entry.label : undefined} />
            {!collapsed && <span className={styles.treeTitle}>{entry.label}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
