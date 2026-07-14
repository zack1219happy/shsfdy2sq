'use client'

import FaIcon from '@/components/FaIcon'
import styles from '@/styles/points.module.css'

export default function ShopPage() {
  return (
    <div className={styles.pointsPage}>
      <h2 className={styles.pointsTitle}>
        <FaIcon name="gift" /> 积分商城
      </h2>

      <div className={styles.shopPlaceholder}>
        <div className={styles.shopPlaceholderIcon}>🛒</div>
        <p className={styles.shopPlaceholderTitle}>即将开放</p>
        <p className={styles.shopPlaceholderText}>
          积分商城正在筹备中，敬请期待！
        </p>
      </div>
    </div>
  )
}
