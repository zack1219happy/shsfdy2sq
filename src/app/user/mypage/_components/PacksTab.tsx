'use client'

/* ============================================
   用户主页 — 表情包卡片（只读展示）
   --------------------------------------------
   只显示此人创建的表情包和包里的表情；散表情不上主页。
   卡片不可点击跳转；非作者有「添加」按钮（订阅整包）。
   右键表情的逻辑与站内其它地方完全一致。
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import FaIcon from '@/components/FaIcon'
import { showWarningToast } from '@/lib/toast'
import { fetchUserPacks, getLibrarySync, subscribePack, currentUserId } from '@/lib/emoji/store'
import { useEmojiContextMenu } from '@/lib/emoji/use-emoji-context-menu'
import { presentPackName } from '@/components/EmojiDialogHost'
import type { EmojiPack } from '@/lib/emoji/types'
import styles from '@/styles/emoji.module.css'
import pageStyles from '@/styles/mypage.module.css'

const DATE_FMT: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', DATE_FMT)
}

function myTakenNames(): string[] {
  const lib = getLibrarySync(currentUserId())
  if (!lib) return []
  return [...lib.emojis.map((e) => e.name), ...lib.packs.map((p) => p.name)]
}

export function PacksTab({ username, isSelf }: { username: string; isSelf: boolean }) {
  // null = 还在加载（状态由数据本身表达，effect 里不做同步 setState）
  const [packs, setPacks] = useState<EmojiPack[] | null>(null)
  const [error, setError] = useState('')
  const cardRef = useRef<HTMLDivElement | null>(null)
  const menu = useEmojiContextMenu(cardRef)

  useEffect(() => {
    let alive = true
    fetchUserPacks(username)
      .then((data) => { if (alive) { setPacks(data); setError('') } })
      .catch((e: Error) => { if (alive) { setError(e.message); setPacks([]) } })
    return () => { alive = false }
  }, [username])

  const doSubscribe = useCallback(async (pack: EmojiPack) => {
    const name = await presentPackName(pack.name, myTakenNames())
    if (!name) return
    try {
      await subscribePack(pack.id, name)
      showWarningToast('已添加整个表情包')
    } catch (e) {
      showWarningToast((e as Error).message || '添加失败')
    }
  }, [])

  if (packs === null) {
    return (
      <div className={pageStyles.tabContent}>
        <div className={pageStyles.placeholderTab}>
          <div className={pageStyles.placeholderIcon}><FaIcon name="spinner" spin /></div>
          <p className={pageStyles.placeholderText}>加载中…</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className={pageStyles.tabContent}>
        <p className={styles.empty}>{error}</p>
      </div>
    )
  }
  if (packs.length === 0) {
    return (
      <div className={pageStyles.tabContent}>
        <p className={`${styles.empty} ${styles.packEmpty}`}>还没有表情包。只有表情包和里面的表情会显示在这里。</p>
      </div>
    )
  }

  return (
    <div ref={cardRef} className={pageStyles.tabContent}>
      <div className={styles.packGrid}>
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={styles.packCard}
            data-pack-card
            data-pack-source-user={pack.source_user_id ?? ''}
            data-pack-id={pack.id}
            data-pack-name={pack.name}
            data-pack-source-name={pack.source_name}
          >
            <div className={styles.packHead}>
              <span className={styles.packName}>{pack.name}</span>
              <span className={styles.packMeta}>
                {formatDate(pack.created_at)} · 添加 {pack.subscribers}
                {!isSelf && (
                  <button
                    type="button"
                    className={styles.chipOp}
                    title="添加到我的表情包库"
                    onClick={() => void doSubscribe(pack)}
                  >
                    +
                  </button>
                )}
              </span>
            </div>
            <div className={styles.packEmojiRow}>
              {pack.emojis.map((emoji) => (
                <span key={emoji.id} className={styles.emojiCell} title={emoji.name}>
                  {emoji.banned ? (
                    <span className={styles.banned} data-emoji-banned="1" data-emoji-hash={emoji.hash}>
                      违规表情
                    </span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element -- 表情图尺寸不定、来源为用户上传，不适合 next/image */
                    <img
                      className={styles.emojiImg}
                      src={emoji.url}
                      alt={emoji.name}
                      data-emoji-name={emoji.name}
                      data-emoji-hash={emoji.hash}
                      data-emoji-url={emoji.url}
                      data-emoji-source-pack={pack.source_name}
                      data-emoji-source-pack-id={pack.id}
                      data-emoji-source-pack-name={pack.source_name}
                      data-emoji-source-user={emoji.source_user_id}
                    />
                  )}
                </span>
              ))}
              {pack.emojis.length === 0 && <p className={styles.empty}>这个包是空的</p>}
            </div>
          </div>
        ))}
      </div>
      {menu}
    </div>
  )
}
