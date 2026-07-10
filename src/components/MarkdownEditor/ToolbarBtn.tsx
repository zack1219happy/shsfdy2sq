/* ============================================
   MarkdownEditor — 单个工具栏按钮
   ============================================ */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { ToolbarBtn, ToggleState } from './types'
import styles from '@/styles/markdown-editor.module.css'

interface ToolbarBtnProps {
  btn: ToolbarBtn
  toggleState: ToggleState
  onClick: (btn: ToolbarBtn) => void
}

/**
 * 渲染单个工具栏按钮或分隔线
 *
 * - name === '|' → 渲染为垂直分隔线
 * - 普通按钮：FontAwesome 图标 + tooltip + 点击回调
 */
export default function ToolbarBtn({ btn, toggleState, onClick }: ToolbarBtnProps) {
  // 分隔线
  if (btn.name === '|') {
    return <span className={styles.toolbarDivider}>|</span>
  }

  // 解析动态 title
  const title =
    typeof btn.title === 'function' ? btn.title(toggleState) : (btn.title ?? '')

  return (
    <button
      className={styles.toolbarBtn}
      title={title}
      onClick={() => onClick(btn)}
      aria-label={title}
      type="button"
    >
      {btn.icon && <FontAwesomeIcon icon={btn.icon} />}
      {btn.content &&
        (typeof btn.content === 'function'
          ? btn.content(toggleState)
          : btn.content)}
    </button>
  )
}
