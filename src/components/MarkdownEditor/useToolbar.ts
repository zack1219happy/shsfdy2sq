/* ============================================
   MarkdownEditor — 工具栏动作分发 Hook
   ============================================ */

'use client'

import { useCallback } from 'react'
import type { ToolbarBtn, ToggleState, DialogRequest } from './types'

interface UseToolbarOptions {
  /** CodeMirror 文本操作 API */
  replaceSelection: (value: string | [string, string]) => void
  toggleState: ToggleState
  setToggleState: (fn: (prev: ToggleState) => ToggleState) => void
  openDialog: (request: DialogRequest) => void
}

interface ToolbarAPI {
  handleAction: (btn: ToolbarBtn) => void
}

/**
 * useToolbar — 分发工具栏按钮点击事件
 *
 * 支持 4 种 action 类型：
 * - insert：包裹/插入文本
 * - legacy：切换 fullScreen/hide/scrollSync
 * - request：打开对话框
 * - function：自定义函数
 */
export function useToolbar({
  replaceSelection,
  toggleState,
  setToggleState,
  openDialog,
}: UseToolbarOptions): ToolbarAPI {
  const handleAction = useCallback(
    (btn: ToolbarBtn) => {
      const action = btn.action

      switch (action.type) {
        case 'insert':
          replaceSelection(action.value)
          break

        case 'legacy':
          switch (action.event) {
            case 'fullScreen':
              setToggleState((prev) => ({
                ...prev,
                fullScreen: !prev.fullScreen,
              }))
              break
            case 'hide':
              setToggleState((prev) => ({
                ...prev,
                previewHidden: !prev.previewHidden,
              }))
              break
            case 'scrollSync':
              setToggleState((prev) => ({
                ...prev,
                scrollSyncEnabled: !prev.scrollSyncEnabled,
              }))
              break
          }
          break

        case 'request': {
          const dialog = action.dialog
          openDialog(dialog)
          break
        }

        case 'function': {
          action.fn({
            dispatch: replaceSelection,
            openDialog,
            toggleState,
            setToggleState,
          })
          break
        }
      }
    },
    [replaceSelection, setToggleState, openDialog, toggleState],
  )

  return { handleAction }
}
