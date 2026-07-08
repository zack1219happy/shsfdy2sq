'use client'

import { supabase } from './supabase'
import type { Comment, CommentsData } from '@/types/gist'

// ---------- 读取 ----------

/** 获取某页面的已审核评论（最新在前） */
export async function fetchPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('page', page)
    .eq('status', 'approved')
    .order('date', { ascending: false })

  if (error) throw new Error(`Supabase 查询失败: ${error.message}`)
  return data ?? []
}

/** 获取所有页面的评论（按页面分组），管理后台用 */
export async function fetchAllComments(): Promise<CommentsData> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .order('date', { ascending: true })

  if (error) throw new Error(`Supabase 查询失败: ${error.message}`)

  const grouped: CommentsData = {}
  for (const c of data ?? []) {
    if (!grouped[c.page]) grouped[c.page] = []
    grouped[c.page].push(c)
  }
  return grouped
}

/** 获取某页面的所有评论（含 pending），管理后台用 */
export async function fetchAllPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('page', page)
    .order('date', { ascending: true })

  if (error) throw new Error(`Supabase 查询失败: ${error.message}`)
  return data ?? []
}

// ---------- 限流 ----------

const RATE_LIMIT_KEY = 'wiki_comment_timestamps'
const MAX_COMMENTS = 60
const WINDOW_MS = 60 * 60 * 1000 // 1 小时

/** 检查是否超过限流，未超过则记录本次提交 */
function checkRateLimit(): void {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem(RATE_LIMIT_KEY)
  const timestamps: number[] = stored ? JSON.parse(stored) : []
  const now = Date.now()
  // 清除窗口外的旧时间戳
  const recent = timestamps.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_COMMENTS) {
    const oldest = recent[0]
    const waitMs = WINDOW_MS - (now - oldest)
    const waitMin = Math.ceil(waitMs / 60000)
    throw new Error(`评论太频繁，请 ${waitMin} 分钟后再试（限制 ${MAX_COMMENTS} 条/小时）`)
  }
  recent.push(now)
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent))
}

// ---------- 写入 ----------

/** 添加新评论（写入 Supabase） */
export async function addComment(
  page: string,
  input: { author: string; content: string; parentId?: string },
): Promise<void> {
  checkRateLimit()

  const { error } = await supabase.from('comments').insert({
    page,
    author: input.author.trim() || '匿名',
    content: input.content.trim(),
    parent_id: input.parentId || null,
    status: 'approved',
    date: new Date().toISOString(),
  })

  if (error) throw new Error(`写入失败: ${error.message}`)
}

// ---------- 审核（管理后台用） ----------

/** 更新评论状态 */
export async function updateCommentStatus(id: string, status: 'pending' | 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error(`更新状态失败: ${error.message}`)
}

/** 删除评论 */
export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`删除失败: ${error.message}`)
}
