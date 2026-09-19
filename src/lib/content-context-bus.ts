/* ============================================
   内容上下文广播 — 表情库 / 用户名白名单共用的版本号
   --------------------------------------------
   渲染是同步的，数据是异步的：数据到位后 bump 一次，
   所有正在渲染的组件按版本号重渲染。
   ============================================ */
'use client'

let version = 0
const listeners = new Set<() => void>()

export function bumpContentContext(): void {
  version += 1
  for (const fn of Array.from(listeners)) {
    try { fn() } catch { /* 订阅者自己处理异常 */ }
  }
}

export function getContentContextVersion(): number {
  return version
}

export function subscribeContentContext(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
