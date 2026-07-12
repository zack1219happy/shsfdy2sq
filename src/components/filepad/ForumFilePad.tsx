'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faComments, faPlus, faPen, faStar } from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

const links = [
  { href: '/forum', icon: faComments, label: '论坛主页' },
  { href: '/forum?my=1', icon: faPen, label: '我的帖子' },
  { href: '/forum?liked=1', icon: faStar, label: '我赞的' },
  { href: '/forum/new', icon: faPlus, label: '发新帖' },
]

export default function ForumFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faComments} className={styles.titleIcon} />
        <span className={styles.titleText}>讨论区</span>
      </div>
      <div className={styles.treeContainer}>
        {links.map((link) => (
          <Link key={link.href} href={link.href} className={styles.treePage}>
            <span className={styles.chevronSlot} />
            <FontAwesomeIcon icon={link.icon} className={styles.treeIcon} />
            <span className={styles.treeLabel}>{link.label}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
