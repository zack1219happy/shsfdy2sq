/* ============================================
   MarkdownEditor — 对话框
   ============================================ */

'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import DialogForm from './DialogForm'
import type { DialogRequest } from './types'
import { t } from './config'
import styles from '@/styles/markdown-editor.module.css'

interface DialogProps {
  request: DialogRequest
  onFinish: (data: Record<string, string>) => void
  onClose: () => void
}

/**
 * 通用插入对话框
 *
 * - 支持 form / tab / component 三种类型（仅 form 完整实现）
 * - 遮罩/Escape 关闭
 * - 锁定 body 滚动
 */
export default function Dialog({ request, onFinish, onClose }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})

  // 锁定 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  const handleFinish = () => onFinish(formData)

  return (
    <div
      className={styles.dialogOverlay}
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
    >
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.dialogHeader}>
          <strong>{request.title}</strong>
          <button
            className={styles.dialogClose}
            onClick={onClose}
            aria-label={t('cancel')}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.dialogBody}>
          {request.type === 'form' && request.fields && (
            <DialogForm fields={request.fields} onData={setFormData} />
          )}
          {request.type === 'tab' && (
            <p style={{ color: '#999', padding: '20px', textAlign: 'center' }}>
              Tab dialog type not yet implemented
            </p>
          )}
          {request.type === 'component' && request.render &&
            request.render({ onFinish, onClose })}
        </div>

        {/* Footer（component 类型由组件自行控制确认） */}
        {request.type !== 'component' && (
          <div className={styles.dialogFooter}>
            <button
              className={`${styles.dialogBtn} ${styles.dialogBtnCancel}`}
              onClick={onClose}
              type="button"
            >
              {t('cancel')}
            </button>
            <button
              className={`${styles.dialogBtn} ${styles.dialogBtnConfirm}`}
              onClick={handleFinish}
              type="button"
            >
              {t('confirm')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
