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

/** 获取某页面的已审核评论（最新在前），同时查最新用户名 */
export async function fetchPageComments(page: string): Promise<Comment[]> {
  // 1. 获取评论
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('page', page)
    .eq('status', 'approved')
    .order('date', { ascending: false })

  if (error) throw new Error(`Supabase 查询失败: ${error.message}`)
  const comments = (data ?? []).map(mapComment)

  // 2. 收集有 user_id 的评论，查最新 username
  const userIds = [...new Set(comments.map(c => c.userId).filter(Boolean))]
  if (userIds.length === 0) return comments

  const { data: users } = await supabase
    .from('wiki_users')
    .select('id, username, color')
    .in('id', userIds)

  const userMap = new Map((users ?? []).map(u => [u.id, u]))

  // 3. 替换 author 为最新 username，设置颜色
  for (const c of comments) {
    if (c.userId && userMap.has(c.userId)) {
      const u = userMap.get(c.userId)!
      c.author = u.username
      c.authorColor = u.color || undefined
    }
  }

  return comments
}

/** 获取所有页面的评论（按页面分组），管理后台用 */
export async function fetchAllComments(): Promise<CommentsData> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .order('date', { ascending: true })

  if (error) throw new Error(`Supabase 查询失败: ${error.message}`)

  const grouped: CommentsData = {}
  for (const raw of data ?? []) {
    const c = mapComment(raw)
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
  return (data ?? []).map(mapComment)
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

/** 添加新评论（写入 Supabase），如果是回复则创建通知 */
export async function addComment(
  page: string,
  input: { author: string; content: string; parentId?: string; userId?: string },
): Promise<void> {
  checkRateLimit()

  const { error } = await supabase.from('comments').insert({
    page,
    author: input.author.trim() || '匿名',
    content: input.content.trim(),
    parent_id: input.parentId || null,
    user_id: input.userId || null,
    status: 'approved',
    date: new Date().toISOString(),
  })

  if (error) throw new Error(`写入失败: ${error.message}`)

  // 如果是回复，给被回复者发通知
  if (input.parentId && input.userId) {
    const { data: parent } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', input.parentId)
      .single<{ user_id: string | null }>()

    if (parent?.user_id) {
      const excerpt = input.content.trim().slice(0, 100)
      await supabase.from('notifications').insert({
        user_id: parent.user_id,
        from_user_id: input.userId,
        comment_id: input.parentId,
        page,
        excerpt: excerpt + (excerpt.length >= 100 ? '…' : ''),
      }).maybeSingle()
    }
  }
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
  const { error } = await supabase
    .from('comments')
    .update({ status })
    .eq('id', id)

  if (error) throw new Error(`更新状态失败: ${error.message}`)
}

