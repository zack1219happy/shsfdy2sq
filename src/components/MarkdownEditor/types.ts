/* ============================================
   MarkdownEditor — 类型定义
   ============================================ */

import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'

// ---------- 工具栏按钮 ----------

/** 按钮 action 类型 */
export type BtnActionType = 'insert' | 'legacy' | 'request' | 'function'

export interface ToolbarBtn {
  name: string
  icon?: IconDefinition
  /** 可以是静态字符串，也可以是运行时从 state 解析的函数 */
  title?: string | ((state: ToggleState) => string)
  /** 按钮上显示的文字（仅当 icon 不可用时） */
  content?: string | ((state: ToggleState) => string)
  action: ToolbarAction
}

export type ToolbarAction =
  | InsertAction
  | LegacyAction
  | RequestAction
  | FunctionAction

export interface InsertAction {
  type: 'insert'
  /** [prefix, suffix] — 包裹选中文本，或仅 prefix（纯插入） */
  value: string | [string, string]
}

export interface LegacyAction {
  type: 'legacy'
  event: 'hide' | 'fullScreen' | 'scrollSync'
}

export interface RequestAction {
  type: 'request'
  dialog: DialogRequest
}

export interface FunctionAction {
  type: 'function'
  fn: (ctx: ToolbarContext) => void
}

// ---------- 工具栏上下文（运行时传入） ----------

export interface ToolbarContext {
  /** 插入/包裹文本，同 replaceSelection */
  dispatch: (value: string | [string, string]) => void
  openDialog: (request: DialogRequest) => void
  toggleState: ToggleState
  setToggleState: (fn: (prev: ToggleState) => ToggleState) => void
}

// ---------- Toggle 状态 ----------

export interface ToggleState {
  fullScreen: boolean
  /** 预览是否隐藏（= 编辑器独占宽度） */
  previewHidden: boolean
  /** 是否隐藏编辑器（= 预览独占宽度） */
  editorHidden: boolean
  scrollSyncEnabled: boolean
}

// ---------- 对话框 ----------

export type DialogType = 'form' | 'tab' | 'component'

export interface DialogField {
  type: 'text' | 'select' | 'code'
  name: string
  label: string
  placeholder?: string
  defaultValue?: string
  options?: { label: string; value: string }[]
}

export interface DialogTab {
  name: string
  title: string
  fields: DialogField[]
}

export interface DialogRequest {
  type: DialogType
  title: string
  fields?: DialogField[]
  tabs?: DialogTab[]
  /** 用户填写完成后调用，返回要插入的 markdown 字符串 */
  fn: (data: Record<string, string>) => string
}

// ---------- 编辑器配置 ----------

export interface MarkdownEditorConfig {
  /** 初始显示预览，默认 true */
  preview?: boolean
  /** 初始全屏，默认 false */
  fullScreen?: boolean
  /** 初始启用滚动同步，默认 true */
  scrollSync?: boolean
}

// ---------- 组件 Props ----------

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  config?: MarkdownEditorConfig
  className?: string
  /** 标题→slug 映射，传入后预览面板启用 [[WikiLink]] 渲染 */
  titleSlugMap?: Record<string, string>
  /** 按 Ctrl+Enter 时触发（用于私信等场景的快捷发送） */
  onSubmit?: () => void
}
