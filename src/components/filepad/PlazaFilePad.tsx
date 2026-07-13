'use client'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faNewspaper, faPen, faListUl } from '@fortawesome/free-solid-svg-icons'
import { PLAZA_CATEGORIES } from '@/types/plaza'
import styles from '@/styles/filepad.module.css'

export default function PlazaFilePad() {
  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faNewspaper} className={styles.titleIcon} />
        <span className={styles.titleText}>广场</span>
      </div>
      <div className={styles.treeContainer}>
        {/* 广场主页 */}
        <Link href="/plaza" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faListUl} className={styles.treeIcon} />
          <span className={styles.treeLabel}>全部文章</span>
        </Link>
        <Link href="/plaza/new" className={styles.treePage}>
          <span className={styles.chevronSlot} />
          <FontAwesomeIcon icon={faPen} className={styles.treeIcon} />
          <span className={styles.treeLabel}>发表文章</span>
        </Link>

        {/* 分类 */}
        {PLAZA_CATEGORIES.map((cat) => (
          <div key={cat.name}>
            {cat.subCategories.length === 1 && cat.subCategories[0] === null ? (
              /* 无子类：直接链接 */
              <Link
                href={`/plaza?category=${encodeURIComponent(cat.name)}`}
                className={styles.treePage}
              >
                <span className={styles.chevronSlot} />
                <FontAwesomeIcon icon={faListUl} className={styles.treeIcon} />
                <span className={styles.treeLabel}>{cat.name}</span>
              </Link>
            ) : (
              /* 有子类：可折叠 */
              <>
                <Link
                  href={`/plaza?category=${encodeURIComponent(cat.name)}`}
                  className={styles.treeFolder}
                >
                  <span className={styles.chevronSlot} />
                  <FontAwesomeIcon icon={faListUl} className={styles.treeIcon} />
                  <span className={styles.treeLabel}>{cat.name}</span>
                </Link>
                {cat.subCategories.map((sub) => (
                  sub === null ? null : (
                    <Link
                      key={sub}
                      href={`/plaza?category=${encodeURIComponent(cat.name)}&sub=${encodeURIComponent(sub)}`}
                      className={styles.treePage}
                    >
                      <span className={styles.chevronSlot} />
                      <span className={styles.treeIcon} />
                      <span className={styles.treeLabel}>{sub}</span>
                    </Link>
                  )
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
