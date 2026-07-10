'use client'

import { supabase } from './supabase'
import type { Comment, CommentsData } from '@/types/gist'

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
    deleted: raw.deleted as boolean | undefined,
  }
}

export async function fetchPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase.rpc('get_page_comments', { p_page: page })
  if (error) throw new Error('查询失败: ' + error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment)
}

export async function fetchAllComments(): Promise<CommentsData> {
  const { data, error } = await supabase.rpc('get_all_comments')
  if (error) throw new Error('查询失败: ' + error.message)
  const grouped: CommentsData = {}
  for (const raw of data ?? []) {
    const c = mapComment(raw as Record<string, unknown>)
    if (!grouped[c.page]) grouped[c.page] = []
    grouped[c.page].push(c)
  }
  return grouped
}

export async function fetchAllPageComments(page: string): Promise<Comment[]> {
  const { data, error } = await supabase.rpc('get_all_page_comments', { p_page: page })
  if (error) throw new Error('查询失败: ' + error.message)
  return ((data ?? []) as Record<string, unknown>[]).map(mapComment)
}

const RATE_LIMIT_KEY = 'wiki_comment_timestamps'
const MAX_COMMENTS = 60
const WINDOW_MS = 60 * 60 * 1000

function checkRateLimit(): void {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem(RATE_LIMIT_KEY)
  let timestamps: number[] = []
  if (stored) {
    try { timestamps = JSON.parse(stored) } catch { localStorage.removeItem(RATE_LIMIT_KEY) }
  }
  const now = Date.now()
  const recent = timestamps.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_COMMENTS) {
    const oldest = recent[0]
    const waitMs = WINDOW_MS - (now - oldest)
    const waitMin = Math.ceil(waitMs / 60000)
    throw new Error('评论太频繁，请 ' + waitMin + ' 分钟后再试（限制 ' + MAX_COMMENTS + ' 条/小时）')
  }
  recent.push(now)
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent))
}

export async function addComment(
  page: string,
  input: { author: string; content: string; parentId?: string },
): Promise<void> {
  checkRateLimit()
  const { error } = await supabase.rpc('add_comment', {
    p_page: page,
    p_author: input.author.trim() || '匿名',
    p_content: input.content.trim(),
    p_parent_id: input.parentId || null,
  })
  if (error) throw new Error('提交失败: ' + error.message)
}

export interface Notification {
  id: string
  from_username: string | null
  page: string
  excerpt: string | null
  read: boolean
  created_at: string
  comment_id: string
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase.rpc('get_notifications')
  if (error) throw new Error('获取通知失败: ' + error.message)
  return (data ?? []) as Notification[]
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_count')
  if (error) return 0
  return (data as number) ?? 0
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
}

export async function clearAllNotifications(): Promise<void> {
  await supabase.rpc('clear_all_notifications')
}

export async function deleteComment(commentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_comment', { p_comment_id: commentId })
  if (error) throw new Error('删除失败: ' + error.message)
  return !!data
}

export async function updateCommentStatus(id: string, status: 'pending' | 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.rpc('update_comment_status', { p_comment_id: id, p_status: status })
  if (error) throw new Error('更新失败: ' + error.message)
}
