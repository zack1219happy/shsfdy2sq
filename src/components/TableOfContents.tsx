'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Heading } from '@/lib/content'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/toc.module.css'

interface Props {
  headings: Heading[]
  /** 是否处于编辑模式（可选，用于原子编辑器） */
  isEditing?: boolean
  /** 切换编辑/阅读模式回调 */
  onToggleEdit?: () => void
}

export default function TableOfContents({ headings, isEditing, onToggleEdit }: Props) {
  const [activeId, setActiveId] = useState<string>('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const timer = setTimeout(() => {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveId(entry.target.id)
              break
            }
          }
        },
        { rootMargin: '-80px 0px -60% 0px', threshold: 0.6 }
      )

      headings.forEach((h) => {
        const el = document.getElementById(h.id)
        if (el) observerRef.current?.observe(el)
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      observerRef.current?.disconnect()
    }
  }, [headings])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const scrollToBottom = useCallback(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  return (
    <aside className={styles.toc}>
      <div className={styles.titleRow}>
        <span className={styles.title}>目录</span>
        <div className={styles.navBtns}>
          {/* 编辑模式切换按钮 */}
          {onToggleEdit && (
            <button
              className={`${styles.navBtn} ${styles.editToggle} ${isEditing ? styles.editActive : ''}`}
              onClick={onToggleEdit}
              title={isEditing ? '切换为阅读模式' : '切换为编辑模式'}
              aria-label={isEditing ? '切换为阅读模式' : '切换为编辑模式'}
            >
              <FaIcon name={isEditing ? 'eye' : 'pen'} />
            </button>
          )}
          <button
            className={styles.navBtn}
            onClick={scrollToTop}
            title="回到顶部"
            aria-label="回到顶部"
          >
            <FaIcon name="arrow-up" />
          </button>
          <button
            className={styles.navBtn}
            onClick={scrollToBottom}
            title="跳到底部"
            aria-label="跳到底部"
          >
            <FaIcon name="arrow-down" />
          </button>
        </div>
      </div>

      {headings.length > 0 ? (
        <ul className={styles.list}>
          {headings.map((h) => (
            <li key={h.id} className={h.level === 2 ? styles.h2 : styles.h3}>
              <a
                href={`#${h.id}`}
                className={activeId === h.id ? styles.active : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' })
                  history.pushState(null, '', `#${h.id}`)
                  setActiveId(h.id)
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyHint}>无标题</div>
      )}
    </aside>
  )
}
