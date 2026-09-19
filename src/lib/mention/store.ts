/* ============================================
   @ 提及 — 用户名白名单缓存
   --------------------------------------------
   渲染时只认「真实用户名」：白名单直接用站内已有的
   全量用户口径（test / admin_wz 本来就被排除在外）。
   ============================================ */
'use client'

import { supabase } from '@/lib/supabase'
import { bumpContentContext } from '@/lib/content-context-bus'

let names: Set<string> | null = null
let loading: Promise<Set<string>> | null = null

const bump = bumpContentContext

/** 同步拿到用户名集合；未加载返回 null（此时不渲染提及，退化为纯文字） */
export function getMentionNamesSync(): Set<string> | null {
  return names
}

export async function loadMentionUsers(): Promise<Set<string>> {
  if (names) return names
  if (loading) return loading
  loading = (async () => {
    const { data, error } = await supabase.rpc('get_all_users')
    if (error) {
      console.warn('[mention] 加载用户名列表失败:', error.message)
      return new Set<string>()
    }
    const set = new Set<string>(
      (data ?? []).map((row: { username: string }) => row.username).filter(Boolean),
    )
    names = set
    bump()
    return set
  })()
  return loading
}

/** 是否认识这个名字（渲染 / 校验用） */
export function isKnownUser(name: string): boolean {
  return names !== null && names.has(name)
}
