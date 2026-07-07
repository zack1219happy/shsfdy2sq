'use client'

import { useEffect, useState, useCallback } from 'react'
import styles from '@/styles/image-modal.module.css'

/**
 * 图片放大查看弹窗
 *
 * 监听全局自定义事件 'open-image-modal'，展示悬浮放大图片。
 * 适用于静态导出（GitHub Pages），不依赖任何路由或动态导入。
 */
export default function ImageModal() {
  const [src, setSrc] = useState<string | null>(null)

  const close = useCallback(() => setSrc(null), [])

  // 监听自定义事件
  useEffect(() => {
    const handler = (e: CustomEvent<string>) => setSrc(e.detail)
    window.addEventListener('open-image-modal', handler as EventListener)
    return () =>
      window.removeEventListener('open-image-modal', handler as EventListener)
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
        <i className="fas fa-times" />
      </button>

      <div className={styles.imageContainer}>
        <img src={src} alt="" className={styles.image} />
      </div>
    </div>
  )
}
