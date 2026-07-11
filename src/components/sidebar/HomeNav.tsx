'use client'

import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/sidebar.module.css'

const ENTRIES = [
  { href: '/wiki',   icon: 'book',     label: 'Wiki 知识库' },
  { href: '/forum',  icon: 'comments', label: '讨论区' },
  { href: '/user',   icon: 'user',     label: '个人设置' },
  { href: '/notice', icon: 'bell',     label: '通知' },
] as const

interface Props {
  collapsed: boolean
}

export default function HomeNav({ collapsed }: Props) {
  return (
    <ul className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
      {ENTRIES.map((entry) => (
        <li key={entry.href} className={styles.treeNode}>
          <Link
            href={entry.href}
            className={styles.nodeContent}
            style={{
              paddingLeft: `${8 + (collapsed ? 0 : 0)}px`,
              textDecoration: 'none',
              color: 'inherit',
            }}
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
