'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell, faInbox, faReply, faBullhorn } from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

const links = [
  { href: '/notice', icon: faInbox, label: '全部' },
  { href: '/notice?type=comment_reply', icon: faReply, label: '评论回复' },
  { href: '/notice?type=forum_reply', icon: faReply, label: '论坛回复' },
  { href: '/notice?type=forum_own_post', icon: faBullhorn, label: '帖子动态' },
]

export default function NoticeFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faBell} className={styles.titleIcon} />
        <span className={styles.titleText}>通知</span>
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
