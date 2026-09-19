'use client'

/* ============================================
   表情命名弹窗 — 命令式调用，返回 Promise
   --------------------------------------------
   添加表情 / 订阅表情包时一律弹这个框让用户自己定名：
   撞了自己库里的名字时输入框红色显示并且不给入库。
   ============================================ */

import { useCallback, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import styles from '@/styles/emoji.module.css'

export interface NameDialogOptions {
  title: string
  hint?: string
  initial: string
  /** 已占用的名字（自己的库里已有的表情名 / 包名） */
  taken?: string[]
  /** 点确定时执行，抛错则弹窗保留 */
  onSubmit?: (name: string) => Promise<void>
  confirmLabel?: string
}

interface OpenState extends NameDialogOptions {
  resolve: (value: string | null) => void
}

let current: OpenState | null = null
const listeners = new Set<() => void>()

function setStore(next: OpenState | null) {
  current = next
  for (const fn of Array.from(listeners)) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 客户端侧名称规则（与数据库端一致，先在这里挡住） */
export function checkNameError(name: string, taken: string[] = []): string {
  if (!name) return '名称不能为空'
  if (name !== name.trim()) return '首尾不能有空格'
  if (/[\n\r]/.test(name)) return '名称不能换行'
  if (name.length > 20) return '最多 20 个字'
  if (/[():{}]/.test(name)) return '不能包含半角冒号、括号、花括号'
  if (taken.includes(name)) return '这个名字已经在你的表情库里'
  return ''
}

/**
 * 弹出命名框。确定 → resolve(名字)；取消 / ESC → resolve(null)。
 * 传了 onSubmit 时，成功也视为完成（名字已入库）。
 */
export function presentName(options: NameDialogOptions): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    setStore({ ...options, resolve })
  })
}

/** 「加入我的表情」用的命名框 */
export function presentEmojiName(defaultName: string, taken: string[] = []): Promise<string | null> {
  return presentName({
    title: '加入我的表情',
    hint: '给它起个名字（≤20 字，不能带半角冒号、括号、花括号）',
    initial: defaultName,
    taken,
    confirmLabel: '加入',
  })
}

/** 「添加整个表情包」用的命名框 */
export function presentPackName(defaultName: string, taken: string[] = []): Promise<string | null> {
  return presentName({
    title: '添加整个表情包',
    hint: '订阅后作者更新会同步过来，包里内容不可增删改',
    initial: defaultName,
    taken,
    confirmLabel: '添加',
  })
}

export function EmojiDialogHost() {
  const state = useSyncExternalStore(subscribe, () => current, () => null)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 打开新弹窗时重置输入（渲染期同步派生，不在 effect 里 setState）
  const [prevState, setPrevState] = useState(state)
  if (prevState !== state) {
    setPrevState(state)
    setValue(state?.initial ?? '')
    setError('')
    setBusy(false)
  }

  const finish = useCallback((result: string | null) => {
    const resolve = current?.resolve
    setStore(null)
    resolve?.(result)
  }, [])

  if (!state) return null

  const invalid = checkNameError(value, state.taken ?? [])
  const submitError = error || invalid

  const onConfirm = async () => {
    const problem = checkNameError(value, state.taken ?? [])
    if (problem) { setError(problem); return }
    if (state.onSubmit) {
      setBusy(true)
      try {
        await state.onSubmit(value)
        finish(value)
      } catch (e) {
        setError((e as Error).message || '操作失败')
      } finally {
        setBusy(false)
      }
      return
    }
    finish(value)
  }

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => { if (e.target === e.currentTarget) finish(null) }}
    >
      <div className={styles.dialog}>
        <div className={styles.dialogTitle}>{state.title}</div>
        {state.hint && <p className={styles.dialogHint}>{state.hint}</p>}
        <input
          className={`${styles.dialogInput} ${submitError ? styles.dialogInputInvalid : ''}`}
          value={value}
          maxLength={40}
          autoFocus
          onChange={(e) => { setValue(e.target.value); setError('') }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void onConfirm() }
            if (e.key === 'Escape') finish(null)
          }}
        />
        {submitError && <p className={styles.dialogError}>{submitError}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={() => finish(null)}>取消</button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={Boolean(submitError) || busy}
            onClick={() => void onConfirm()}
          >
            {state.confirmLabel ?? '确定'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
