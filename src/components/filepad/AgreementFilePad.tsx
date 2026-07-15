'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faScaleBalanced,
  faFileContract,
  faBook,
  faFileLines,
  faBullhorn,
} from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

const links = [
  { href: '/agreement', icon: faFileContract, label: '协议与帮助' },
  { href: '/agreement/user-agreement', icon: faScaleBalanced, label: '用户协议' },
  { href: '/agreement/community-guidelines', icon: faBook, label: '社区规范' },
  { href: '/agreement/notice', icon: faBullhorn, label: '公告' },
  { href: '/agreement/markdown-helper', icon: faFileLines, label: 'Markdown 帮助' },
]

export default function AgreementFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faScaleBalanced} className={styles.titleIcon} />
        <span className={styles.titleText}>协议与帮助</span>
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
