'use client'

import { useEffect, useState, useCallback } from 'react'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/image-modal.module.css'

/**
 * 图片放大查看弹窗
 *
 * 通过事件委托监听所有带 data-image-modal 属性的图片点击，
 * 展示悬浮放大图片。
 * 适用于静态导出（GitHub Pages），不依赖任何路由或动态导入。
 */
export default function ImageModal() {
  const [src, setSrc] = useState<string | null>(null)

  const close = useCallback(() => setSrc(null), [])

  // 事件委托：监听所有带 data-image-modal 的图片点击
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'IMG' && target.hasAttribute('data-image-modal')) {
        setSrc((target as HTMLImageElement).src)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // 阻止背景滚动 + ESC 关闭
  useEffect(() => {
    if (!src) return
    document.body.style.overflow = 'hidden'
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handler)
    }
  }, [src, close])

  if (!src) return null

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <button
        className={styles.closeBtn}
        onClick={close}
        aria-label="关闭"
        type="button"
      >
        <FaIcon name="times" />
      </button>

      <div className={styles.imageContainer}>
        <img src={src} alt="" className={styles.image} />
      </div>
    </div>
  )
}
