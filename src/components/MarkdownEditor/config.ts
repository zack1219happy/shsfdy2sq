/* ============================================
   MarkdownEditor — 配置、按钮定义、对话框请求、i18n
   ============================================ */

import {
  faBold,
  faItalic,
  faStrikethrough,
  faMinus,
  faHeading,
  faListUl,
  faListOl,
  faImage,
  faLink,
  faCode,
  faTable,
  faEye,
  faEyeSlash,
  faExpandArrowsAlt,
  faCompressArrowsAlt,
  faLock,
  faLockOpen,
} from '@fortawesome/free-solid-svg-icons'

import React from 'react'

import type {
  ToolbarBtn,
  DialogRequest,
  MarkdownEditorConfig,
  ToggleState,
} from './types'

// ============================================================
// i18n 中文标签
// ============================================================

export const labels: Record<string, string> = {
  bold: '粗体',
  italic: '斜体',
  strikethrough: '删除线',
  hr: '分割线',
  h1: '1 级标题',
  h2: '2 级标题',
  h3: '3 级标题',
  h4: '4 级标题',
  h5: '5 级标题',
  h6: '6 级标题',
  ul: '无序列表',
  ol: '有序列表',
  img: '插入图片',
  link: '插入链接',
  code: '插入代码',
  table: '插入表格',
  fullScreen: '全屏',
  exitFullScreen: '取消全屏',
  hidePreview: '隐藏预览',
  showPreview: '显示预览',
  disableScrollSync: '停用滚动同步',
  enableScrollSync: '启用滚动同步',
  // 对话框
  dialogImgTitle: '插入图片',
  dialogImgUrl: '图片地址',
  dialogImgAlt: '图片描述',
  dialogLinkTitle: '插入链接',
  dialogLinkUrl: '链接地址',
  dialogLinkText: '链接标题',
  dialogTableTitle: '插入表格',
  dialogTableRows: '行数',
  dialogTableCols: '列数',
  dialogTableAlign: '对齐方式',
  dialogTableAlignLeft: '左对齐',
  dialogTableAlignCenter: '居中',
  dialogTableAlignRight: '右对齐',
  dialogCodeTitle: '插入代码',
  dialogCodeLang: '语言类型',
  dialogCodeContent: '代码',
  // 通用
  confirm: '确定',
  cancel: '取消',
  noSelect: '未选择',
}

export function t(key: string): string {
  return labels[key] ?? key
}

// ============================================================
// 对话框请求
// ============================================================

export const IMAGE_DIALOG: DialogRequest = {
  type: 'form',
  title: t('dialogImgTitle'),
  fields: [
    { type: 'text', name: 'url', label: t('dialogImgUrl'), placeholder: 'https://…' },
    { type: 'text', name: 'alt', label: t('dialogImgAlt') },
  ],
  fn: (data) => `![${data.alt || ''}](${data.url || ''})`,
}

export const LINK_DIALOG: DialogRequest = {
  type: 'form',
  title: t('dialogLinkTitle'),
  fields: [
    { type: 'text', name: 'href', label: t('dialogLinkUrl'), placeholder: 'https://…' },
    { type: 'text', name: 'text', label: t('dialogLinkText') },
  ],
  fn: (data) => `[${data.text || data.href}](${data.href || ''})`,
}

export const TABLE_DIALOG: DialogRequest = {
  type: 'form',
  title: t('dialogTableTitle'),
  fields: [
    { type: 'text', name: 'rows', label: t('dialogTableRows'), defaultValue: '3' },
    { type: 'text', name: 'cols', label: t('dialogTableCols'), defaultValue: '2' },
  ],
  fn: (data) => {
    const rows = Math.max(1, parseInt(data.rows) || 3)
    const cols = Math.max(1, parseInt(data.cols) || 2)
    const header = '| ' + Array(cols).fill('标题').join(' | ') + ' |'
    const divider = '| ' + Array(cols).fill('---').join(' | ') + ' |'
    const body = Array(rows - 1)
      .fill('| ' + Array(cols).fill('').join(' | ') + ' |')
      .join('\n')
    return '\n' + header + '\n' + divider + (body ? '\n' + body : '') + '\n'
  },
}

export const CODE_DIALOG: DialogRequest = {
  type: 'form',
  title: t('dialogCodeTitle'),
  fields: [
    {
      type: 'select',
      name: 'lang',
      label: t('dialogCodeLang'),
      defaultValue: '',
      options: [
        { label: 'c', value: 'c' },
        { label: 'cpp', value: 'cpp' },
        { label: 'python', value: 'python' },
        { label: 'java', value: 'java' },
        { label: 'javascript', value: 'javascript' },
        { label: 'typescript', value: 'typescript' },
        { label: 'html', value: 'html' },
        { label: 'css', value: 'css' },
        { label: 'bash', value: 'bash' },
        { label: 'latex', value: 'latex' },
        { label: t('noSelect'), value: '' },
      ],
    },
    { type: 'code', name: 'code', label: t('dialogCodeContent') },
  ],
  fn: (data) => '```' + (data.lang || '') + '\n' + (data.code || '') + '\n```\n',
}

// ============================================================
// 工具栏按钮定义
// ============================================================

// --- Simple insert: 包裹或插入 ---

const boldBtn: ToolbarBtn = {
  name: 'bold',
  icon: faBold,
  title: t('bold'),
  action: { type: 'insert', value: ['**', '**'] },
}

const italicBtn: ToolbarBtn = {
  name: 'italic',
  icon: faItalic,
  title: t('italic'),
  action: { type: 'insert', value: ['_', '_'] },
}

const strikethroughBtn: ToolbarBtn = {
  name: 'strikethrough',
  icon: faStrikethrough,
  title: t('strikethrough'),
  action: { type: 'insert', value: ['~~', '~~'] },
}

const hrBtn: ToolbarBtn = {
  name: 'hr',
  icon: faMinus,
  title: t('hr'),
  action: { type: 'insert', value: '\n\n---\n' },
}

const ulBtn: ToolbarBtn = {
  name: 'ul',
  icon: faListUl,
  title: t('ul'),
  action: { type: 'insert', value: '- ' },
}

const olBtn: ToolbarBtn = {
  name: 'ol',
  icon: faListOl,
  title: t('ol'),
  action: { type: 'insert', value: '1. ' },
}

// --- Headers (function) ---

function makeHeaderBtn(level: number): ToolbarBtn {
  return {
    name: `h${level}`,
    content: `H${level}`,
    title: t(`h${level}`),
    action: {
      type: 'function',
      fn: ({ dispatch }) => dispatch('#'.repeat(level) + ' '),
    },
  }
}

const header1Btn = makeHeaderBtn(1)
const header2Btn = makeHeaderBtn(2)
const header3Btn = makeHeaderBtn(3)
const header4Btn = makeHeaderBtn(4)
const header5Btn = makeHeaderBtn(5)
const header6Btn = makeHeaderBtn(6)

// --- Dialog-triggering ---

const imgBtn: ToolbarBtn = {
  name: 'img',
  icon: faImage,
  title: t('img'),
  action: {
    type: 'function',
    fn: ({ openDialog }) => {
      // 动态导入确保 ImageUploadDialog（'use client'）不造成模块边界问题
      import('./ImageUploadDialog').then((mod) => {
        const ImageUploadDlg = mod.default
        openDialog({
          type: 'component',
          title: t('dialogImgTitle'),
          fn: (data) => `![${data.alt || ''}](${data.url || ''})`,
          render: ({ onFinish, onClose }) =>
            React.createElement(ImageUploadDlg, { onFinish, onClose }),
        })
      })
    },
  },
}

const linkBtn: ToolbarBtn = {
  name: 'link',
  icon: faLink,
  title: t('link'),
  action: { type: 'request', dialog: LINK_DIALOG },
}

const tableBtn: ToolbarBtn = {
  name: 'table',
  icon: faTable,
  title: t('table'),
  action: { type: 'request', dialog: TABLE_DIALOG },
}

const codeBtn: ToolbarBtn = {
  name: 'code',
  icon: faCode,
  title: t('code'),
  action: { type: 'request', dialog: CODE_DIALOG },
}

// --- Legacy toggle buttons ---

const hideBtn: ToolbarBtn = {
  name: 'hide',
  icon: faEye,
  title: (s) => (s.previewHidden ? t('showPreview') : t('hidePreview')),
  action: { type: 'legacy', event: 'hide' },
}

const fullScreenBtn: ToolbarBtn = {
  name: 'fullScreen',
  icon: faExpandArrowsAlt,
  title: (s) => (s.fullScreen ? t('exitFullScreen') : t('fullScreen')),
  action: { type: 'legacy', event: 'fullScreen' },
}

const scrollSyncBtn: ToolbarBtn = {
  name: 'scrollSync',
  icon: faLock,
  title: (s) => (s.scrollSyncEnabled ? t('disableScrollSync') : t('enableScrollSync')),
  action: { type: 'legacy', event: 'scrollSync' },
}

// --- Divider ---

const divider: ToolbarBtn = {
  name: '|',
  title: '',
  action: { type: 'insert' as const, value: '' },
}

// ============================================================
// 工具栏布局
// ============================================================

export const defaultBtns: ToolbarBtn[] = [
  boldBtn, strikethroughBtn, italicBtn, hrBtn,
  divider,
  header1Btn, header2Btn, header3Btn, header4Btn, header5Btn, header6Btn,
  divider,
  ulBtn, olBtn,
  divider,
  imgBtn, linkBtn, codeBtn, tableBtn,
  divider,
  hideBtn, fullScreenBtn, scrollSyncBtn,
]

export const simpleBtns: ToolbarBtn[] = [
  boldBtn, strikethroughBtn, italicBtn, hrBtn,
  divider,
  header1Btn, header2Btn, header3Btn,
  ulBtn, olBtn,
  divider,
  imgBtn, linkBtn, tableBtn,
  divider,
  hideBtn, fullScreenBtn,
]

// ============================================================
// 默认配置
// ============================================================

export const DEFAULT_CONFIG: MarkdownEditorConfig = {
  preview: true,
  fullScreen: false,
  scrollSync: true,
}
