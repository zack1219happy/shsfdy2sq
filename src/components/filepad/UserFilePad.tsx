'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser, faCoins, faGift, faPalette, faCog } from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

export default function UserFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faUser} className={styles.titleIcon} />
        <span className={styles.titleText}>用户</span>
      </div>
      <div className={styles.treeContainer}>
        <Link href="/user/points" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faCoins} className={styles.treeIcon} />
          <span className={styles.treeLabel}>积分明细</span>
        </Link>
        <Link href="/user/shop" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faGift} className={styles.treeIcon} />
          <span className={styles.treeLabel}>积分商城</span>
        </Link>
        <Link href="/user/appearance" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faPalette} className={styles.treeIcon} />
          <span className={styles.treeLabel}>名称装扮</span>
        </Link>
        <Link href="/user" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faCog} className={styles.treeIcon} />
          <span className={styles.treeLabel}>账号设置</span>
        </Link>
      </div>
    </>
  )
}
