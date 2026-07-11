'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

// ---- 模块级预拉取 — 一导入（应用启动）就开始请求 ----
let _fetchPromise: Promise<Map<string, string> | null> | null = null

async function fetchColors(): Promise<Map<string, string> | null> {
  if (_fetchPromise) return _fetchPromise
  _fetchPromise = Promise.resolve(
    supabase.rpc('get_all_users').then(
      ({ data }) => {
        if (!data) return null as Map<string, string> | null
        const map = new Map<string, string>()
        for (const u of data as { username: string; color: string | null }[]) {
          if (u.color) map.set(u.username, u.color)
        }
        return map
      },
      () => null as Map<string, string> | null,
    ),
  )
  return _fetchPromise
}

// 立即启动（不 await），首次渲染时请求已经发出去了
fetchColors()

// ---- Context ----
const UserColorContext = createContext<Map<string, string>>(new Map())

/**
 * 挂载时等待模块级预拉取完成，将结果通过 Context 下发。
 * 预拉取在模块导入时已经开始，所以首次渲染时有大概率已完成。
 */
export function UserColorProvider({ children }: { children: ReactNode }) {
  const [colorMap, setColorMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    fetchColors().then((map) => {
      if (!cancelled && map) setColorMap(map)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <UserColorContext.Provider value={colorMap}>
      {children}
    </UserColorContext.Provider>
  )
}

/**
 * 根据 username 获取其颜色 CSS 值。
 * 如果库中找不到、或值为空，返回 null。
 */
export function useUserColor(username: string): string | null {
  const map = useContext(UserColorContext)
  return map.get(username) ?? null
}
