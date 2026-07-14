'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { BUILTIN_TAGS } from '@/types/gist'

// ---- 用户装饰数据结构 ----
export interface UserDecoration {
  color: string | null
  tags: string[]
}

// ---- 模块级预拉取 — 一导入（应用启动）就开始请求 ----
let _fetchPromise: Promise<Map<string, UserDecoration> | null> | null = null

async function fetchDecorations(): Promise<Map<string, UserDecoration> | null> {
  if (_fetchPromise) return _fetchPromise
  _fetchPromise = Promise.resolve(
    supabase.rpc('get_all_users').then(
      ({ data }) => {
        if (!data) return null as unknown as Map<string, UserDecoration> | null
        const map = new Map<string, UserDecoration>()
        const users = data as Array<{ username: string; color: string | null; equipped_tags: string[] | null }>
        for (const u of users) {
          const builtin = BUILTIN_TAGS[u.username] ?? []
          map.set(u.username, {
            color: u.color ?? null,
            tags: [...builtin, ...(u.equipped_tags ?? [])],
          })
        }
        return map
      },
      () => null as unknown as Map<string, UserDecoration> | null,
    ),
  )
  return _fetchPromise
}

// 立即启动（不 await），首次渲染时请求已经发出去了
fetchDecorations()

// ---- Context ----
const UserDecorationContext = createContext<Map<string, UserDecoration>>(new Map())

/**
 * 挂载时等待模块级预拉取完成，将结果通过 Context 下发。
 * 提供每个用户的颜色和标签信息。
 */
export function UserColorProvider({ children }: { children: ReactNode }) {
  const [decorationMap, setDecorationMap] = useState<Map<string, UserDecoration>>(new Map())

  useEffect(() => {
    let cancelled = false
    fetchDecorations().then((map) => {
      if (!cancelled && map) setDecorationMap(map)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <UserDecorationContext.Provider value={decorationMap}>
      {children}
    </UserDecorationContext.Provider>
  )
}

/**
 * 获取用户名颜色（向后兼容）
 */
export function useUserColor(username: string): string | null {
  const map = useContext(UserDecorationContext)
  return map.get(username)?.color ?? null
}

/**
 * 获取用户完整装饰信息（颜色 + 标签列表）
 * 标签列表已包含内置身份 tag（如创始人、工程师）
 */
export function useUserDecoration(username: string): UserDecoration | null {
  const map = useContext(UserDecorationContext)
  return map.get(username) ?? null
}
