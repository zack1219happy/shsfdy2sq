'use client'

import { useEffect, useRef, useCallback, useMemo } from 'react'

/* ==============================================================
   useAutoSave - 通用草稿实时保存 Hook

   - data 变化时实时写入 localStorage
   - beforeunload（关闭/刷新）时保存
   - 组件卸载（Next.js 客户端路由跳转）时保存
   - 提供 clearDraft() 清除草稿
   ============================================================== */

const DRAFT_PREFIX = 'wiki_draft_'

export interface UseAutoSaveOptions<T> {
  /** localStorage 键名（会自动加 wiki_draft_ 前缀） */
  key: string
  /** 要保存的数据 */
  data: T
  /** 是否启用自动保存（表单有内容时才启用） */
  enabled: boolean
}

/**
 * 通用草稿实时保存 Hook
 *
 * 使用方式：
 * ```ts
 * const { clearDraft } = useAutoSave({
 *   key: 'forum_new',
 *   data: { title, content },
 *   enabled: title.trim() !== '' || content.trim() !== '',
 * })
 * // 提交成功后：
 * clearDraft()
 * ```
 *
 * 草稿恢复使用 loadDraft(key) 工具函数，在页面加载时调用。
 */
export function useAutoSave<T>({
  key,
  data,
  enabled,
}: UseAutoSaveOptions<T>) {
  const storageKey = DRAFT_PREFIX + key
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const serialized = useMemo(() => {
    if (!enabled) return null
    try { return JSON.stringify(data) } catch { return null }
  }, [data, enabled])

  const save = useCallback(() => {
    if (!enabledRef.current) return
    try {
      const payload = {
        data,
        savedAt: new Date().toISOString(),
      }
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {
      // localStorage 不可用，静默失败
    }
    // serialized 变化时 data 一定变了，ignore exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, serialized])

  // 实时保存：serialized 变化即写入
  useEffect(() => {
    if (!enabled || serialized === null) return
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ data, savedAt: new Date().toISOString() }),
      )
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized])

  // beforeunload：页面关闭/刷新时保存
  useEffect(() => {
    const handler = () => save()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [save])

  // 组件卸载时（Next.js 客户端路由跳转）保存
  // 但先检查 localStorage 中是否仍有草稿：
  // 若已调用过 clearDraft()（如发布成功后），则不再重新写入，避免旧内容残留
  useEffect(() => {
    return () => {
      if (enabledRef.current) {
        try {
          if (localStorage.getItem(storageKey)) save()
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save])

  /** 清除草稿 */
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey) } catch {}
  }, [storageKey])

  return { clearDraft, save }
}

/**
 * 从 localStorage 恢复草稿
 */
export function loadDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.data ?? null
  } catch {
    return null
  }
}

/**
 * 检查是否有已保存的草稿
 */
export function hasDraft(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) !== null
  } catch {
    return false
  }
}
