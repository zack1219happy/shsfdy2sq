'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser } from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

export default function UserFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faUser} className={styles.titleIcon} />
        <span className={styles.titleText}>用户设置</span>
      </div>
      <div className={styles.treeContainer}>
        <Link href="/user" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faUser} className={styles.treeIcon} />
          <span className={styles.treeLabel}>账号设置</span>
        </Link>
      </div>
    </>
  )
}
