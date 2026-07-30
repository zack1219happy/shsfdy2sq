'use client'

import { useState } from 'react'

interface Props {
  /** 用户选择后的回调：mode='safe' 或 'js'，dismiss 表示是否勾选了"不再提示" */
  onChoice: (mode: 'safe' | 'js', dismiss: boolean) => void
}

/**
 * JS 安全警告弹窗
 *
 * 当用户访问已启用 JS 的 wiki 页面时弹出此对话框，
 * 让用户选择"安全模式"还是"阅读原文"。
 */
export default function JSSafetyDialog({ onChoice }: Props) {
  const [dismiss, setDismiss] = useState(false)

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--color-bg, #fff)',
        borderRadius: 'var(--border-radius-lg, 12px)',
        padding: '32px',
        maxWidth: '460px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        color: 'var(--color-text, #1a1a1a)',
      }}>
        {/* 标题 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: 16,
        }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <span>安全提醒</span>
        </div>

        {/* 正文 */}
        <p style={{
          fontSize: '0.95rem',
          lineHeight: 1.6,
          margin: '0 0 20px',
          color: 'var(--color-text-secondary, #555)',
        }}>
          此文章启用了 JavaScript 功能，可能包含动态内容。
          在信任此内容之前，请谨慎决定是否运行其中的脚本，
          以免对您的设备和数据造成损害。
        </p>

        {/* 不再提示 */}
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.9rem',
          marginBottom: 20,
          cursor: 'pointer',
          color: 'var(--color-text-secondary, #555)',
        }}>
          <input
            type="checkbox"
            checked={dismiss}
            onChange={(e) => setDismiss(e.target.checked)}
          />
          不再对此文章弹出此提示
        </label>

        {/* 按钮组 */}
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={() => onChoice('safe', dismiss)}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--border-radius, 8px)',
              border: '1px solid var(--color-border, #ddd)',
              background: 'var(--color-bg-secondary, #f5f5f5)',
              color: 'var(--color-text, #1a1a1a)',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            🔒 在安全模式下浏览
          </button>
          <button
            onClick={() => onChoice('js', dismiss)}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--border-radius, 8px)',
              border: 'none',
              background: '#e74c3c',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 600,
            }}
          >
            📄 仍然阅读原文
          </button>
        </div>
      </div>
    </div>
  )
}
