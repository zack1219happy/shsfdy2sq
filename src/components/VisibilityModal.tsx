'use client'

import { useMemo, useState } from 'react'
import { UserName } from '@/components/UserName'
import { getPinyinInitials } from '@/lib/people'
import type { UserInfo } from '@/types/gist'
import styles from '@/styles/forum.module.css'

interface VisibilityModalProps {
  allUsers: UserInfo[]
  usersLoading?: boolean
  excludedUserIds: string[]
  onToggle: (userId: string) => void
  onClose: () => void
}

/**
 * VisibilityModal — 可见性选择模态框
 *
 * 搜索用户并通过开关切换某用户是否「不可见」此帖子。
 */
export default function VisibilityModal({
  allUsers,
  usersLoading,
  excludedUserIds,
  onToggle,
  onClose,
}: VisibilityModalProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          !search.trim() ||
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          getPinyinInitials(u.name).toLowerCase().includes(search.toLowerCase()),
      ),
    [allUsers, search],
  )

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.visibilityModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.visibilityModalHeader}>
          <h3>选择不可见用户</h3>
          <button type="button" className={styles.visibilityModalClose} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.visibilityModalSearch}>
          <input
            type="text"
            placeholder="搜索姓名或用户名…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className={styles.visibilityModalList}>
          {usersLoading ? (
            <p className={styles.visibilityModalEmpty}>加载中…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.visibilityModalEmpty}>无匹配用户</p>
          ) : (
            <>
              {filtered.map((u) => {
                const excluded = excludedUserIds.includes(u.id)
                return (
                  <label key={u.id} className={styles.visibilityModalItem}>
                    <span className={styles.visibilityModalName}>
                      <span className={styles.visibilityModalInitials}>{getPinyinInitials(u.name)}</span>
                      <span className={styles.visibilityModalUsername}>@<UserName username={u.username} /></span>
                    </span>
                    <div
                      className={`${styles.toggleSwitch} ${excluded ? styles.toggleOn : ''}`}
                      onClick={() => onToggle(u.id)}
                    >
                      <div className={styles.toggleSlider} />
                    </div>
                  </label>
                )
              })}
            </>
          )}
        </div>

        <div className={styles.visibilityModalFooter}>
          <span className={styles.visibilityModalHint}>
            开启开关 = 该用户<strong>不可见</strong>此帖子
          </span>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onClose}
          >
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
