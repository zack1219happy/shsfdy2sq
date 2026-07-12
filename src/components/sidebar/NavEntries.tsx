'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faComments,
  faBook,
  faUser,
  faBell,
  faScaleBalanced,
} from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/sidebar.module.css'

const entries = [
  { href: '/wiki', icon: faBook, label: 'Wiki' },
  { href: '/forum', icon: faComments, label: '讨论区' },
  { href: '/agreement', icon: faScaleBalanced, label: '协议与帮助' },
  { href: '/notice', icon: faBell, label: '通知' },
  { href: '/user', icon: faUser, label: '用户设置' },
]

export default function HomeNav() {
  return (
    <>
      {entries.map((e) => (
        <Link key={e.href} href={e.href} className={styles.navItem}>
          <span className={styles.navIcon}>
            <FontAwesomeIcon icon={e.icon} />
          </span>
          <span className={styles.navLabel}>{e.label}</span>
        </Link>
      ))}
    </>
  )
}
