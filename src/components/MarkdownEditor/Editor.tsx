/* ============================================
   MarkdownEditor — 主编辑器组件
   ============================================ */

'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useCodeMirror, CodeMirror } from './useCodeMirror'
import { usePreview } from './usePreview'
import { useToolbar } from './useToolbar'
import { useDialog } from './useDialog'
import Toolbar from './Toolbar'
import Dialog from './Dialog'
import { DEFAULT_CONFIG } from './config'
import { findLineInPreview } from './scrollSync'
import { useCodeCopy } from '@/lib/useCodeCopy'
import { useMentionHydration } from '@/components/MentionHydrator'
import { useEmojiContextMenu } from '@/lib/emoji/use-emoji-context-menu'
import { getSession } from '@/lib/auth'
import { useEmojiLibrary } from '@/lib/emoji/use-emoji-context'
import styles from '@/styles/markdown-editor.module.css'
import type { EditorProps, MarkdownEditorConfig, ToggleState, DialogRequest } from './types'

export default function Editor({
  value,
  onChange,
  config,
  className,
  titleSlugMap,
  assetsMap,
  onSubmit,
  noSanitizePreview,
  previewClassName,
  contextUserId,
}: EditorProps) {
  // 1. Config
  const merged: MarkdownEditorConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [config],
  )

  // 2. Toggle state
  const [toggleState, setToggleState] = useState<ToggleState>({
    fullScreen: merged.fullScreen ?? false,
    previewHidden: !(merged.preview ?? true),
    editorHidden: false,
    scrollSyncEnabled: merged.scrollSync ?? true,
  })
  const toggleRef = useRef(toggleState)

  // 保持 ref 指向最新 toggleState（scroll 事件处理器读取时拿到当前值）
  useEffect(() => {
    toggleRef.current = toggleState
  })

  // 防反馈循环：当一个方向正在同步时，另一个方向跳过
  const syncingRef = useRef(false)

  // 表情身份：默认就是「正在写内容的自己」
  const editorUserId = contextUserId === undefined ? (getSession()?.userId ?? null) : contextUserId
  // 编辑自己的内容时预热表情库，预览里立刻能看到表情图
  useEmojiLibrary(editorUserId && editorUserId === getSession()?.userId ? editorUserId : null)

  // 3. Dialog
  const { dialog, openDialog, closeDialog } = useDialog()
  const dialogFnRef = useRef<((data: Record<string, string>) => string) | null>(null)

  // 4. CodeMirror Hook
  const { viewRef, extensions, replaceSelection, scrollToLine, onCreateEditor } =
    useCodeMirror({
      completion: { disableEmoji: !editorUserId },
      value,
      onChange,
      onSubmit,
      onEditorScroll:
        toggleState.scrollSyncEnabled && !toggleState.previewHidden
          ? (lineNumber: number) => {
              if (syncingRef.current) return
              const st = toggleRef.current
              if (!st.scrollSyncEnabled || st.previewHidden) return
              const pEl = previewRef.current
              if (!pEl) return
              const target = findLineInPreview(pEl, lineNumber)
              if (target) {
                syncingRef.current = true
                target.scrollIntoView({ block: 'start', behavior: 'instant' })
                // 保持锁 100ms 让所有级联滚动事件安定
                setTimeout(() => { syncingRef.current = false }, 100)
              }
            }
          : undefined,
    })

  const handleOpenDialog = useCallback(
    (req: DialogRequest) => {
      dialogFnRef.current = req.fn
      openDialog(req)
    },
    [openDialog],
  )

  const handleFinishDialog = useCallback(
    (data: Record<string, string>) => {
      const fn = dialogFnRef.current
      dialogFnRef.current = null
      const result = fn?.(data)
      if (result) {
        const view = viewRef.current?.view
        if (view) {
          const { from, to } = view.state.selection.main
          view.dispatch({
            changes: { from, to, insert: result },
            selection: { anchor: from + result.length },
            scrollIntoView: true,
          })
          view.focus()
        }
      }
      closeDialog()
    },
    [closeDialog, viewRef],
  )

  const scrollToLineRef = useRef(scrollToLine)

  // 保持 ref 指向最新 scrollToLine（scroll 事件处理器读取时拿到当前值）
  useEffect(() => {
    scrollToLineRef.current = scrollToLine
  })

  // 5. Preview Hook
  const { previewRef, previewHtml } = usePreview({
    content: value,
    onPreviewScroll: toggleState.scrollSyncEnabled
      ? (lineNumber: number) => {
          if (syncingRef.current) return
          const st = toggleRef.current
          if (!st.scrollSyncEnabled) return
          syncingRef.current = true
          scrollToLineRef.current(lineNumber)
          setTimeout(() => { syncingRef.current = false }, 100)
        }
      : undefined,
    titleSlugMap,
    assetsMap,
    noSanitize: noSanitizePreview,
    contextUserId: editorUserId,
  })
  useCodeCopy(previewRef)
  const emojiMenu = useEmojiContextMenu(previewRef)
  const mentionPortals = useMentionHydration(previewRef, previewHtml)

  // 6. Toolbar
  const { handleAction } = useToolbar({
    replaceSelection,
    toggleState,
    setToggleState,
    openDialog: handleOpenDialog,
  })

  // 7. onChange
  const handleChange = useCallback(
    (val: string) => onChange?.(val),
    [onChange],
  )

  // 8. CSS
  const containerClass = [
    styles.editor,
    toggleState.fullScreen ? styles.editorFullscreen : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClass}>
      <Toolbar onAction={handleAction} toggleState={toggleState} />

      <div className={styles.ground}>
        {/* 编辑区 */}
        <div
          className={[
            styles.pane,
            styles.paneEditor,
            toggleState.editorHidden ? styles.paneHidden : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <CodeMirror
            ref={viewRef}
            value={value}
            onChange={handleChange}
            extensions={extensions}
            onCreateEditor={onCreateEditor}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              foldGutter: false,
              // @ 提及 / 表情补全需要（候选源由 completions.ts 提供）
              autocompletion: true,
              bracketMatching: false,
              closeBrackets: false,
              indentOnInput: true,
            }}
            placeholder="输入 Markdown…"
            height="100%"
          />
        </div>

        {/* 预览区 */}
        {!toggleState.previewHidden && (
          <div
            className={[
              styles.pane,
              styles.panePreview,
              toggleState.editorHidden ? styles.paneFull : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div ref={previewRef} className={styles.previewArea}>
              <div
                className={`wiki-body ${styles.previewContent} ${previewClassName ?? ''}`}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <Dialog
          request={dialog.request}
          onFinish={handleFinishDialog}
          onClose={closeDialog}
        />
      )}
      {emojiMenu}
      {mentionPortals}
    </div>
  )
}
