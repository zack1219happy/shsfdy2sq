'use client'

import { supabase } from './supabase'
import type { Comment, CommentsData, ForumPost, ForumComment, NotificationType, UserInfo } from '@/types/gist'

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
  type: NotificationType
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase.rpc('get_notifications')
  if (error) throw new Error('获取通知失败: ' + error.message)
  return ((data ?? []) as Notification[]).map((n: any) => ({
    ...n,
    type: n.type ?? 'comment_reply',
  }))
}

export async function getUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_count')
  if (error) return 0
  return (data as number) ?? 0
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
}

export async function clearAllNotifications(type?: string): Promise<void> {
  if (type) {
    await supabase.rpc('clear_notifications_by_type', { p_type: type })
  } else {
    await supabase.rpc('clear_all_notifications')
  }
}

export async function deleteNotifications(type?: string): Promise<void> {
  if (type) {
    await supabase.rpc('delete_notifications', { p_type: type })
  } else {
    await supabase.rpc('delete_notifications')
  }
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

/* =============================================================
   Forum API — 讨论区操作
   ============================================================= */

export async function fetchForumPosts(): Promise<ForumPost[]> {
  const { data, error } = await supabase.rpc('get_forum_posts')
  if (error) throw new Error('获取帖子列表失败: ' + error.message)
  return (data ?? []) as ForumPost[]
}

export async function fetchLikedPostIds(): Promise<string[]> {
  const s = (await import('@/lib/auth')).getSession()
  if (!s) return []
  const { data, error } = await supabase.rpc('get_user_liked_posts', { p_user_id: s.userId })
  if (error) throw new Error('获取赞过的帖子失败: ' + error.message)
  return (data ?? []).map((r: { post_id: string }) => r.post_id)
}

export async function fetchForumPost(postId: string): Promise<ForumPost | null> {
  const { data, error } = await supabase.rpc('get_forum_post', { p_post_id: postId })
  if (error) throw new Error('获取帖子失败: ' + error.message)
  return (data ?? [])[0] ?? null
}

export async function createForumPost(title: string, content: string, excludedVisibility?: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_forum_post', {
    p_title: title.trim(),
    p_content: content.trim(),
    p_excluded_visibility: excludedVisibility && excludedVisibility.length > 0 ? excludedVisibility : [],
  })
  if (error) throw new Error('发帖失败: ' + error.message)
  return data as string
}

export async function fetchForumComments(postId: string): Promise<ForumComment[]> {
  const { data, error } = await supabase.rpc('get_forum_comments', { p_post_id: postId })
  if (error) throw new Error('获取评论失败: ' + error.message)
  return ((data ?? []) as ForumComment[]).map((c: any) => ({ ...c, deleted: !!c.deleted }))
}

export async function addForumComment(
  postId: string,
  content: string,
  parentId?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_forum_comment', {
    p_post_id: postId,
    p_content: content.trim(),
    p_parent_id: parentId || null,
  })
  if (error) throw new Error('评论失败: ' + error.message)
  return data as string
}

export async function voteForumPost(postId: string, voteType: 'up' | 'down'): Promise<void> {
  const { error } = await supabase.rpc('vote_forum_post', {
    p_post_id: postId,
    p_vote_type: voteType,
  })
  if (error) throw new Error('投票失败: ' + error.message)
}

export async function removeForumVote(postId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_forum_vote', { p_post_id: postId })
  if (error) throw new Error('取消投票失败: ' + error.message)
}

export async function getUserForumVote(postId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_forum_vote', { p_post_id: postId })
  if (error) return null
  return data as string | null
}

export async function updateForumPost(postId: string, title: string, content: string, excludedVisibility?: string[] | null): Promise<void> {
  const { error } = await supabase.rpc('update_forum_post', {
    p_post_id: postId,
    p_title: title.trim(),
    p_content: content.trim(),
    p_excluded_visibility: excludedVisibility !== undefined ? (excludedVisibility ?? []) : null,
  })
  if (error) throw new Error('编辑失败: ' + error.message)
}

export async function deleteForumComment(commentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_forum_comment', { p_comment_id: commentId })
  if (error) throw new Error('删除失败: ' + error.message)
  return !!data
}

/* =============================================================
   Visibility API — 帖子可见性
   ============================================================= */

export async function fetchAllUsers(): Promise<UserInfo[]> {
  const { data, error } = await supabase.rpc('get_all_users')
  if (error) throw new Error('获取用户列表失败: ' + error.message)
  return (data ?? []) as UserInfo[]
}
