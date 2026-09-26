'use client'

import { supabase } from '../supabase'
import type { UserInfo } from '@/types/gist'

/** 全量用户列表（可见性选择、新对话选择等场景） */
export async function fetchAllUsers(): Promise<UserInfo[]> {
  const { data, error } = await supabase.rpc('get_all_users')
  if (error) throw new Error('获取用户列表失败: ' + error.message)
  return (data ?? []) as UserInfo[]
}

/** 获取指定用户不可卸装的公开身份标签 */
export async function fetchUserBuiltinTags(userId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_public_user_builtin_tags', { p_user_id: userId })
  if (error) throw new Error('获取内置身份标签失败: ' + error.message)
  const rows = (data ?? []) as Array<{ user_id: string; tags: string[] }>
  return rows.find(row => row.user_id === userId)?.tags ?? []
}
