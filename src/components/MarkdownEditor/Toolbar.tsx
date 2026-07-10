/* ============================================
   MarkdownEditor — 工具栏
   ============================================ */

'use client'

import { useEffect, useState } from 'react'
import ToolbarBtn from './ToolbarBtn'
import { defaultBtns, simpleBtns } from './config'
import type { ToolbarBtn as ToolbarBtnType, ToggleState } from './types'
import styles from '@/styles/markdown-editor.module.css'

interface ToolbarProps {
  onAction: (btn: ToolbarBtnType) => void
  toggleState: ToggleState
}

/**
 * 编辑器工具栏
 *
 * - 大屏（>768px）：完整按钮组
 * - 小屏（≤768px）：精简按钮组
 */
export default function Toolbar({ onAction, toggleState }: ToolbarProps) {
  const [isBigScreen, setIsBigScreen] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    setIsBigScreen(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsBigScreen(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const btns = isBigScreen ? defaultBtns : simpleBtns

  if (btns.length === 0) return null

  return (
    <div className={styles.toolbar}>
      {btns.map((btn, index) => (
        <ToolbarBtn
          key={`${btn.name}-${index}`}
          btn={btn}
          toggleState={toggleState}
          onClick={onAction}
        />
      ))}
    </div>
  )
}
