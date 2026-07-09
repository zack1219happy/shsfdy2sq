'use client'

import { supabase } from './supabase'
import type { Comment, CommentsData } from '@/types/gist'

// ---------- 字段映射 ----------

/** 将 Supabase 返回的蛇形字段转为前端驼峰 Comment */
function mapComment(raw: Record<string, unknown>): Comment {
  return {
    id: raw.id as string,
    page: raw.page as string,
    author: raw.author as string,
    content: raw.content as string,
    date: raw.date as string,
    parentId: raw.parent_id as string | undefined,
    status: raw.status as 'pending' | 'approved' | 'rejected',
    userId: raw.user_id as string | undefined,
    authorColor: raw.author_color as string | undefined,
  }
}

// ---------- 读取 ----------

/** 获取某页面的已审核评论（最新在前），通过 RPC 联表查最新用户名和颜色 */
export async function fetchPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase.rpc('get_page_comments', { p_page: page })
  if (error) throw new Error(`查询失败: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment)
}

/** 获取所有页面的评论（按页面分组），管理后台用 */
export async function fetchAllComments(): Promise<CommentsData> {
  const { data, error } = await supabase.rpc('get_all_comments')
  if (error) throw new Error(`查询失败: ${error.message}`)

  const grouped: CommentsData = {}
  for (const raw of data ?? []) {
    const c = mapComment(raw as Record<string, unknown>)
    if (!grouped[c.page]) grouped[c.page] = []
    grouped[c.page].push(c)
  }
  return grouped
}

/** 获取某页面的所有评论（含 pending），管理后台用 */
export async function fetchAllPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase.rpc('get_all_page_comments', { p_page: page })
  if (error) throw new Error(`查询失败: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment)
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

/** 添加新评论（写入 Supabase），回复通知由 RPC 内部处理 */
export async function addComment(
  page: string,
  input: { author: string; content: string; parentId?: string; userId?: string },
): Promise<void> {
  checkRateLimit()

  const { error } = await supabase.rpc('add_comment', {
    p_page: page,
    p_author: input.author.trim() || '匿名',
    p_content: input.content.trim(),
    p_parent_id: input.parentId || null,
    p_user_id: input.userId || null,
  })

  if (error) throw new Error(`提交失败: ${error.message}`)
}

// ---------- 通知 ----------

export interface Notification {
  id: string
  from_username: string | null
  page: string
  excerpt: string | null
  read: boolean
  created_at: string
}

export async function fetchNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase.rpc('get_notifications', { p_user_id: userId })
  if (error) throw new Error(`获取通知失败: ${error.message}`)
  return (data ?? []) as Notification[]
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_count', { p_user_id: userId })
  if (error) return 0
  return (data as number) ?? 0
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await supabase.rpc('mark_notification_read', { p_notification_id: notificationId, p_user_id: userId })
}

export async function clearAllNotifications(userId: string): Promise<void> {
  await supabase.rpc('clear_all_notifications', { p_user_id: userId })
}

// ---------- 删除 ----------

/** 删除评论（权限由后端 RPC 控制） */
export async function deleteComment(
  commentId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_comment', {
    p_comment_id: commentId,
    p_user_id: userId,
  })

  if (error) throw new Error(`删除失败: ${error.message}`)
  return !!data
}

// ---------- 审核（管理后台用） ----------

/** 更新评论状态 */
export async function updateCommentStatus(id: string, status: 'pending' | 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.rpc('update_comment_status', {
    p_comment_id: id,
    p_status: status,
  })

  if (error) throw new Error(`更新失败: ${error.message}`)
}

