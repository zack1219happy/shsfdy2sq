/* ============================================
   内容上下文 Hook — 表情库 + 用户名白名单
   --------------------------------------------
   两个数据都是异步的，渲染是同步的：
   加载完成后 bump 版本号，驱动调用方重新渲染。
   ============================================ */
'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getLibrarySync, loadLibrary } from '@/lib/emoji/store'
import { loadMentionUsers } from '@/lib/mention/store'
import {
  getContentContextVersion,
  subscribeContentContext,
} from '@/lib/content-context-bus'
import type { EmojiLibrary } from '@/lib/emoji/types'

/**
 * 内容上下文版本号：表情库或用户名白名单有变化就会变，
 * 适合直接放进 useMemo 依赖里。
 */
export function useContentContextVersion(): number {
  return useSyncExternalStore(subscribeContentContext, getContentContextVersion, () => 0)
}

/**
 * 取得「内容作者」的表情库：进来时自动预热，加载完成后重渲染。
 * 返回 null 表示没有身份或库未就绪 → 表情按纯文字显示。
 */
export function useEmojiLibrary(userId?: string | null): EmojiLibrary | null {
  const version = useContentContextVersion()

  useEffect(() => {
    // 提及渲染用的用户名白名单在这里一起预热
    loadMentionUsers().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!userId) return
    loadLibrary(userId).catch(() => undefined)
  }, [userId, version])

  return getLibrarySync(userId)
}
