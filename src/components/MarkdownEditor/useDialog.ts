/* ============================================
   MarkdownEditor — 对话框生命周期 Hook
   ============================================ */

'use client'

import { useState, useCallback } from 'react'
import type { DialogRequest } from './types'

interface DialogState {
  request: DialogRequest
}

interface UseDialogReturn {
  /** 当前活动的对话框，null 表示无对话框 */
  dialog: DialogState | null
  openDialog: (request: DialogRequest) => void
  closeDialog: () => void
  finishDialog: (data: Record<string, string>) => string
}

/**
 * useDialog — 管理编辑器的插入对话框生命周期
 *
 * - openDialog / closeDialog 控制显隐
 * - finishDialog 调用 request.fn(data) 返回要插入的 markdown 字符串
 */
export function useDialog(): UseDialogReturn {
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const openDialog = useCallback((request: DialogRequest) => {
    setDialog({ request })
  }, [])

  const closeDialog = useCallback(() => {
    setDialog(null)
  }, [])

  const finishDialog = useCallback(
    (data: Record<string, string>): string => {
      if (!dialog) return ''
      const result = dialog.request.fn(data)
      setDialog(null)
      return result
    },
    [dialog],
  )

  return { dialog, openDialog, closeDialog, finishDialog }
}
