'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface Toast {
  id: number
  message: string
  leaving?: boolean
}

let nextToastId = 0

/**
 * ToastProvider — 基于 React Portal 的全局 Toast 通知
 *
 * 监听自定义 DOM 事件 'show-toast'，使 showWarningToast() 等命令式
 * 调用仍然生效，但渲染由 React 的 Portal 管理。
 *
 * 在 layout.tsx 中包裹 <ToastProvider> 即可使用。
 */
export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string) => {
    const id = nextToastId++
    setToasts((prev) => [...prev, { id, message }])

    // 3 秒后标记退出，再 300ms 后移除
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      )
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 300)
    }, 3000)
  }, [])

  // 监听自定义 DOM 事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      addToast(detail?.message ?? '')
    }
    window.addEventListener('show-toast', handler)
    return () => window.removeEventListener('show-toast', handler)
  }, [addToast])

  return (
    <>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: '12px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'inline-block',
                  background: '#dc2626',
                  color: '#fff',
                  padding: '10px 24px',
                  borderRadius: 'var(--border-radius, 4px)',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  boxShadow: '0 4px 16px rgba(220, 38, 38, 0.3)',
                  animation: t.leaving
                    ? 'fadeOut 0.3s ease-out forwards'
                    : 'toastFadeInDown 0.2s ease-out',
                }}
              >
                {t.message}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
