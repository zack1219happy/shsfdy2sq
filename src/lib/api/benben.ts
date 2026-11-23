'use client'

import { supabase } from '../supabase'
import type { BenbenPost } from '@/types/benben'

/* =============================================================
   Benben API — 犇犇（微动态）
   与论坛/广场一致：所有读写都走 RPC，前端没有任何表权限。
   ============================================================= */

/** 拉取犇犇流（按时间倒序，最多 limit 条） */
export async function fetchBenbenFeed(limit = 20): Promise<BenbenPost[]> {
  const { data, error } = await supabase.rpc('get_benben_feed', { p_limit: limit })
  if (error) throw new Error('获取犇犇失败: ' + error.message)
  return (data ?? []) as BenbenPost[]
}

/** 发射一条犇犇，返回新记录的 id（+1 积分在数据库侧完成） */
export async function createBenben(content: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_benben', { p_content: content.trim() })
  if (error) throw new Error('发射失败: ' + error.message)
  return data as string
}

/** 删除自己的犇犇（管理员可删任意一条） */
export async function deleteBenben(benbenId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_benben', { p_benben_id: benbenId })
  if (error) throw new Error('删除失败: ' + error.message)
}

/** 点赞 / 取消点赞，返回操作后的状态 */
export async function toggleBenbenLike(benbenId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_benben_like', { p_benben_id: benbenId })
  if (error) throw new Error('点赞失败: ' + error.message)
  return !!data
}
