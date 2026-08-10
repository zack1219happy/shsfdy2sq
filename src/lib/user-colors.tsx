'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { BUILTIN_TAGS, type TagData } from '@/types/gist'

// ---- 用户装饰数据结构 ----
export interface UserDecoration {
  /** 当前用户名。改名后通过 get_all_users 拉取的是最新值，显示会跟随。 */
  username: string | null
  color: string | null
  tags: TagData[]
}

/** 装饰索引：id → 装饰；username → id（当前用户名反向索引） */
interface DecorationIndex {
  byId: Map<string, UserDecoration>
  byUsername: Map<string, string>
}

// ---- 模块级预拉取 — 一导入（应用启动）就开始请求 ----
let _fetchPromise: Promise<DecorationIndex | null> | null = null

async function fetchDecorations(): Promise<DecorationIndex | null> {
  if (_fetchPromise) return _fetchPromise
  _fetchPromise = Promise.resolve(
    supabase.rpc('get_all_users').then(
      ({ data }) => {
        if (!data) return null as unknown as DecorationIndex | null
        const byId = new Map<string, UserDecoration>()
        const byUsername = new Map<string, string>()
        const users = data as Array<{ id: string; username: string | null; color: string | null; equipped_tags: TagData[] | null }>
        for (const u of users) {
          if (!u.id) continue
          const builtin = (BUILTIN_TAGS[u.username ?? ''] ?? []).map(v => ({ v, c: null }))
          byId.set(u.id, {
            username: u.username ?? null,
            color: u.color ?? null,
            tags: [...builtin, ...(u.equipped_tags ?? [])],
          })
          if (u.username) byUsername.set(u.username, u.id)
        }
        return { byId, byUsername }
      },
      () => null as unknown as DecorationIndex | null,
    ),
  )
  return _fetchPromise
}

// 立即启动（不 await），首次渲染时请求已经发出去了
fetchDecorations()

// ---- Context ----
interface DecorationContextValue {
  index: DecorationIndex
  /** 装饰数据是否已加载完成（false = 仍在前端预拉取中） */
  loaded: boolean
}

const UserDecorationContext = createContext<DecorationContextValue>({
  index: { byId: new Map(), byUsername: new Map() },
  loaded: false,
})

/**
 * 挂载时等待模块级预拉取完成，将结果通过 Context 下发。
 * 提供每个用户的颜色和标签信息（按用户 ID 索引，兼有当前用户名反向索引）。
 */
export function UserColorProvider({ children }: { children: ReactNode }) {
  const [decorationIndex, setDecorationIndex] = useState<DecorationIndex>({ byId: new Map(), byUsername: new Map() })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchDecorations().then((idx) => {
      if (!cancelled && idx) setDecorationIndex(idx)
      if (!cancelled) setLoaded(true)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <UserDecorationContext.Provider value={{ index: decorationIndex, loaded }}>
      {children}
    </UserDecorationContext.Provider>
  )
}

/**
 * 按用户 ID 获取装饰（核心）。用户改过名后，历史内容作者带 user ID，
 * 用它来定位，颜色/标签/当前用户名都不会因改名而丢失。
 */
export function useUserById(userId: string | null | undefined): UserDecoration | null {
  const { index } = useContext(UserDecorationContext)
  if (!userId) return null
  return index.byId.get(userId) ?? null
}

/**
 * 获取用户名颜色（向后兼容）
 */
export function useUserColor(username: string): string | null {
  return useUserDecoration(username)?.color ?? null
}

/**
 * 获取用户完整装饰信息（颜色 + 标签列表）。按当前用户名反向解析到 ID 再取值。
 * 历史内容的旧用户名快照解析不到时返回 null，由调用方回退。
 */
export function useUserDecoration(username: string): UserDecoration | null {
  const { index } = useContext(UserDecorationContext)
  const id = index.byUsername.get(username)
  if (!id) return null
  return index.byId.get(id) ?? null
}

/**
 * 装饰数据是否已加载完成（false = 还在预拉取中，此时解析不到不代表用户不存在）。
 */
export function useDecorationsLoaded(): boolean {
  return useContext(UserDecorationContext).loaded
}
