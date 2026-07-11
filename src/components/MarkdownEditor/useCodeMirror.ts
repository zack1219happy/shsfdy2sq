/* ============================================
   MarkdownEditor — CodeMirror 6 集成 Hook
   ============================================ */

'use client'

import { useRef, useMemo, useCallback, useEffect, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/** useCodeMirror 返回值 */
export interface CodeMirrorAPI {
  viewRef: React.RefObject<ReactCodeMirrorRef | null>
  extensions: Extension[]
  replaceSelection: (value: string | [string, string]) => void
  getSelection: () => string
  scrollToLine: (lineNumber: number) => void
  getTopVisibleLine: () => number
  /** 供 Editor.tsx 传给 <CodeMirror onCreateEditor> */
  onCreateEditor: (view: EditorView) => void
}

interface UseCodeMirrorOptions {
  value: string
  onChange?: (value: string) => void
  onEditorScroll?: (lineNumber: number) => void
}

/**
 * useCodeMirror — 封装 @uiw/react-codemirror
 *
 * scroll sync 通过原生 scroll 事件监听 .cm-scroller，
 * 用 onCreateEditor 捕获 EditorView 引用，不依赖 viewRef 更新时序。
 */
export function useCodeMirror({
  value,
  onChange,
  onEditorScroll,
}: UseCodeMirrorOptions): CodeMirrorAPI {
  const viewRef = useRef<ReactCodeMirrorRef | null>(null)
  const [editorView, setEditorView] = useState<EditorView | null>(null)

  const onScrollRef = useRef(onEditorScroll)
  onScrollRef.current = onEditorScroll

  // 用 useState 存 editorView，使 scroll listener effect 能在 view 就绪时重跑
  const onCreateEditor = useCallback((view: EditorView) => {
    setEditorView(view)
  }, [])

  // 原生 scroll 事件监听（直接绑在 .cm-scroller 上）
  // 依赖 [onEditorScroll, editorView]：view 就绪后自动绑定
  useEffect(() => {
    if (!editorView || !onEditorScroll) return

    const scroller = editorView.scrollDOM
    if (!scroller) return

    let rafId: number | null = null

    const handler = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        // 用 data-line 属性临时记录调试信息
        const scrollTop = scroller.scrollTop
        const line = editorView.lineBlockAtHeight(scrollTop)
        const lineNum = editorView.state.doc.lineAt(line.from).number - 1
        onScrollRef.current?.(lineNum)
      })
    }
    scroller.addEventListener('scroll', handler, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', handler)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [onEditorScroll, editorView])

  // markdown 语法扩展
  const extensions = useMemo<Extension[]>(
    () => [
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      EditorView.lineWrapping,
    ],
    [],
  )

  // ---- 文本操作 API ----

  const getEditorView = useCallback(
    () => editorView ?? viewRef.current?.view ?? null,
    [editorView],
  )

  const replaceSelection = useCallback((value: string | [string, string]) => {
    const view = getEditorView()
    if (!view) return

    const { from: selFrom, to: selTo } = view.state.selection.main
    const selected = view.state.sliceDoc(selFrom, selTo)

    let insert: string
    let newAnchor: number
    let from = selFrom
    let to = selTo

    if (Array.isArray(value)) {
      const [prefix, suffix] = value
      insert = prefix + selected + suffix
      newAnchor = selected ? from + insert.length : from + prefix.length
    } else {
      const line = view.state.doc.lineAt(from)
      insert = value
      newAnchor = line.from + insert.length
      from = line.from
      to = line.from
    }

    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: newAnchor },
      scrollIntoView: true,
    })
    view.focus()
  }, [getEditorView])

  const getSelection = useCallback((): string => {
    const view = getEditorView()
    if (!view) return ''
    const { from, to } = view.state.selection.main
    return view.state.sliceDoc(from, to)
  }, [getEditorView])

  const scrollToLine = useCallback((lineNumber: number) => {
    const view = getEditorView()
    if (!view) return
    const line = view.state.doc.line(Math.max(1, lineNumber + 1))
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
    })
  }, [getEditorView])

  const getTopVisibleLine = useCallback((): number => {
    const view = getEditorView()
    if (!view) return 0
    const b = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
    return view.state.doc.lineAt(b.from).number
  }, [getEditorView])

  return {
    viewRef,
    extensions,
    replaceSelection,
    getSelection,
    scrollToLine,
    getTopVisibleLine,
    onCreateEditor,
  }
}

export { CodeMirror, type ReactCodeMirrorRef }
