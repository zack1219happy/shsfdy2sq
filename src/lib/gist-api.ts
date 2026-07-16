'use client'

import { supabase } from './supabase'
import { showWarningToast } from './toast'
import type { Comment, CommentsData, ForumPost, ForumComment, NotificationType, UserInfo } from '@/types/gist'
import type { PlazaArticle, PlazaArticleDetail, PlazaArticleListResult, PlazaComment, PlazaCategory } from '@/types/plaza'
import type { WishItem, WishComment } from '@/types/wishes'

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

export async function createForumPost(title: string, content: string, excludedVisibility?: string[], agentVisible = true): Promise<string> {
  const { data, error } = await supabase.rpc('create_forum_post', {
    p_title: title.trim(),
    p_content: content.trim(),
    p_excluded_visibility: excludedVisibility && excludedVisibility.length > 0 ? excludedVisibility : [],
    p_agent_visible: agentVisible,
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

export async function updateForumPost(postId: string, title: string, content: string, excludedVisibility?: string[] | null, agentVisible?: boolean): Promise<void> {
  const { error } = await supabase.rpc('update_forum_post', {
    p_post_id: postId,
    p_title: title.trim(),
    p_content: content.trim(),
    p_excluded_visibility: excludedVisibility !== undefined ? (excludedVisibility ?? []) : null,
    p_agent_visible: agentVisible ?? null,
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

/* =============================================================
   DM API — 私信
   ============================================================= */

export interface Conversation {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_name: string
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

export interface DmMessage {
  id: string
  sender_id: string
  sender_username: string
  content: string
  created_at: string
  recalled_at: string | null
  is_mine: boolean
}

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('get_conversations')
  if (error) throw new Error('获取对话列表失败: ' + error.message)
  return (data ?? []) as Conversation[]
}

export async function getMessages(conversationId: string, limit = 50, before?: string): Promise<DmMessage[]> {
  const params: Record<string, any> = { p_conversation_id: conversationId, p_limit: limit }
  if (before) params.p_before = before
  const { data, error } = await supabase.rpc('get_messages', params)
  if (error) throw new Error('获取消息失败: ' + error.message)
  return (data ?? []) as DmMessage[]
}

export async function sendMessage(otherUserId: string, content: string): Promise<string> {
  const { data, error } = await supabase.rpc('send_message', {
    p_other_user_id: otherUserId,
    p_content: content,
  })
  if (error) throw new Error('发送失败: ' + error.message)
  return data as string
}

export async function recallMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('recall_message', { p_message_id: messageId })
  if (error) throw new Error('撤回失败: ' + error.message)
}

export async function getUnreadDmCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_dm_count')
  if (error) return 0
  return (data as number) ?? 0
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
}

export async function heartbeatConversation(conversationId: string): Promise<void> {
  await supabase.rpc('heartbeat_conversation', { p_conversation_id: conversationId })
}

export async function leaveConversation(conversationId: string): Promise<void> {
  await supabase.rpc('leave_conversation', { p_conversation_id: conversationId })
}

/* =============================================================
   Plaza API — 文章广场
   - 分类从 plaza_categories 表动态读取，不再硬编码
   - 列表支持分类筛选、搜索、我写的/我赞的 标签页
   - 可见性只有公开 / 私密两态（is_public: boolean），
     没有论坛的 excluded_visibility 数组
   - 点赞走 toggle_plaza_like RPC（乐观更新）
   ============================================================= */

/** 获取所有分类（扁平列表，前端自行构建树结构） */
export async function fetchPlazaCategories(): Promise<PlazaCategory[]> {
  const { data, error } = await supabase.rpc('get_plaza_categories')
  if (error) throw new Error('获取分类失败: ' + error.message)
  return (data ?? []) as PlazaCategory[]
}

export async function fetchPlazaArticles(
  categoryId?: string,
  search?: string,
  limit = 50,
  offset = 0,
  my?: boolean,
  liked?: boolean,
): Promise<PlazaArticleListResult[]> {
  const params: Record<string, any> = { p_limit: limit, p_offset: offset }
  if (categoryId) params.p_category_id = categoryId
  if (search) params.p_search = search
  if (my) params.p_my = true
  if (liked) params.p_liked = true
  const { data, error } = await supabase.rpc('get_plaza_articles', params)
  if (error) throw new Error('获取广场文章失败: ' + error.message)
  return ((data ?? []) as any[]).map((r: any) => ({
    ...r,
    like_count: r.upvote_count ?? r.like_count ?? 0,
    downvote_count: r.downvote_count ?? 0,
  })) as PlazaArticleListResult[]
}

export async function fetchPlazaArticle(slug: string): Promise<PlazaArticleDetail> {
  const { data, error } = await supabase.rpc('get_plaza_article', { p_slug: slug })
  if (error) throw new Error('获取文章失败: ' + error.message)
  const row = (data as any[] | null)?.[0]
  if (!row) throw new Error('文章不存在')
  return {
    ...row,
    like_count: row.upvote_count ?? row.like_count ?? 0,
    downvote_count: row.downvote_count ?? 0,
  } as PlazaArticleDetail
}

export async function createPlazaArticle(
  title: string,
  slug: string,
  content: string,
  categoryId: string,
  isPublic: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_plaza_article', {
    p_title: title.trim(),
    p_slug: slug.trim(),
    p_content: content.trim(),
    p_category_id: categoryId,
    p_is_public: isPublic,
  })
  if (error) throw new Error('发布文章失败: ' + error.message)
  return data as string
}

export async function updatePlazaArticle(
  id: string,
  title: string,
  content: string,
  categoryId: string,
  isPublic: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('update_plaza_article', {
    p_article_id: id,
    p_title: title.trim(),
    p_content: content.trim(),
    p_category_id: categoryId,
    p_is_public: isPublic,
  })
  if (error) throw new Error('编辑失败: ' + error.message)
}

export async function deletePlazaArticle(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_plaza_article', { p_article_id: id })
  if (error) throw new Error('删除失败: ' + error.message)
}

export async function votePlazaArticle(articleId: string, voteType: 'up' | 'down'): Promise<void> {
  const { error } = await supabase.rpc('vote_plaza_article', {
    p_article_id: articleId,
    p_vote_type: voteType,
  })
  if (error) throw new Error('投票失败: ' + error.message)
}

export async function removePlazaVote(articleId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_plaza_vote', { p_article_id: articleId })
  if (error) throw new Error('取消投票失败: ' + error.message)
}

export async function getUserPlazaVote(articleId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_plaza_vote', { p_article_id: articleId })
  if (error) return null
  return data as string | null
}

export async function fetchLikedPlazaIds(): Promise<string[]> {
  const s = (await import('@/lib/auth')).getSession()
  if (!s) return []
  const { data, error } = await supabase.rpc('get_user_liked_plaza_ids', { p_user_id: s.userId })
  if (error) throw new Error('获取赞过的文章失败: ' + error.message)
  return (data ?? []).map((r: { article_id: string }) => r.article_id)
}

/* =============================================================
   Plaza 评论区 API
   ============================================================= */

export async function fetchPlazaComments(articleId: string): Promise<PlazaComment[]> {
  const { data, error } = await supabase.rpc('get_plaza_comments', { p_article_id: articleId })
  if (error) throw new Error('获取评论失败: ' + error.message)
  return ((data ?? []) as PlazaComment[]).map((c: any) => ({ ...c, deleted: !!c.deleted }))
}

export async function addPlazaComment(
  articleId: string,
  content: string,
  parentId?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_plaza_comment', {
    p_article_id: articleId,
    p_content: content.trim(),
    p_parent_id: parentId || null,
  })
  if (error) throw new Error('评论失败: ' + error.message)
  return data as string
}

export async function deletePlazaComment(commentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_plaza_comment', { p_comment_id: commentId })
  if (error) throw new Error('删除失败: ' + error.message)
  return !!data
}

/* =============================================================
   许愿池 API
   ============================================================= */

export async function fetchAllWishes(tier?: string): Promise<WishItem[]> {
  const { data, error } = await supabase.rpc('get_all_wishes', { p_tier: tier || null })
  if (error) throw new Error('获取许愿列表失败: ' + error.message)
  return (data ?? []) as WishItem[]
}

export async function fetchWishById(id: string): Promise<WishItem> {
  const { data, error } = await supabase.rpc('get_wish_by_id', { p_id: id })
  if (error) throw new Error('获取许愿详情失败: ' + error.message)
  const rows = data as WishItem[]
  if (!rows || rows.length === 0) throw new Error('许愿不存在')
  return rows[0]
}

export async function fetchWishComments(wishId: string): Promise<WishComment[]> {
  const { data, error } = await supabase.rpc('get_wish_comments', { p_wish_id: wishId })
  if (error) throw new Error('获取评论失败: ' + error.message)
  return ((data ?? []) as WishComment[]).map((c: any) => ({ ...c, deleted: !!c.deleted }))
}

export async function addWishComment(
  wishId: string,
  content: string,
  parentId?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('add_wish_comment', {
    p_wish_id: wishId,
    p_content: content.trim(),
    p_parent_id: parentId || null,
  })
  if (error) throw new Error('评论失败: ' + error.message)
  return data as string
}

export async function deleteWishComment(commentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_wish_comment', { p_comment_id: commentId })
  if (error) throw new Error('删除失败: ' + error.message)
  return !!data
}

/** 用积分支付许愿服务费 */
export async function payWishWithPoints(wishId: string): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('pay_wish_with_points', { p_wish_id: wishId })
  if (error) return { success: false, message: error.message }
  return (data ?? { success: false, message: '支付失败' }) as { success: boolean; message: string }
}

export async function updateWishStatus(
  id: string,
  status: string,
  estimatedHours?: string,
  estimatedStage?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_wish_status', {
    p_id: id,
    p_status: status,
    p_estimated_hours: estimatedHours || null,
    p_estimated_stage: estimatedStage || null,
  })
  if (error) throw new Error('更新状态失败: ' + error.message)
  return !!data
}

/* =============================================================
   Points API — 积分系统
   ============================================================= */

import type { TodayProgress, PointsTransaction, ShopItem, UserPurchase, UserDecoration, TagData } from '@/types/gist'

export async function fetchTodayProgress(): Promise<TodayProgress> {
  const { data, error } = await supabase.rpc('get_today_progress')
  if (error) throw new Error('获取任务进度失败: ' + error.message)
  return (data as TodayProgress) ?? { checked_in: false, comments_today: 0, posts_today: 0, total_points: 0 }
}

export async function fetchPointsHistory(limit = 20, offset = 0): Promise<PointsTransaction[]> {
  const { data, error } = await supabase.rpc('get_points_history', {
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error('获取积分记录失败: ' + error.message)
  return (data ?? []) as PointsTransaction[]
}

export async function fetchMyPoints(): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_points')
  if (error) return 0
  return (data as number) ?? 0
}

export async function awardPlazaArticlePoints(articleId: string, amount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('award_plaza_article_points', {
    p_article_id: articleId,
    p_amount: amount,
  })
  if (error) throw new Error('奖励积分失败: ' + error.message)
  return !!data
}

/* =============================================================
   Shop API — 积分商城
   ============================================================= */

/** 获取所有可购买商品 */
export async function fetchShopItems(): Promise<ShopItem[]> {
  const { data, error } = await supabase.rpc('get_shop_items')
  if (error) throw new Error('获取商品列表失败: ' + error.message)
  return (data ?? []) as ShopItem[]
}

/** 获取当前用户已购买的商品 */
export async function fetchUserPurchases(): Promise<UserPurchase[]> {
  const { data, error } = await supabase.rpc('get_user_purchases')
  if (error) throw new Error('获取已购商品失败: ' + error.message)
  return (data ?? []) as UserPurchase[]
}

/** 购买商品 */
export async function purchaseItem(itemId: string): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('purchase_item', { p_item_id: itemId })
  if (error) return { success: false, message: error.message }
  return (data ?? { success: false, message: '购买失败' }) as { success: boolean; message: string }
}

/** 装备颜色（传 null 卸装） */
export async function equipColor(itemId: string | null): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('equip_color', { p_item_id: itemId })
  if (error) return { success: false, message: error.message }
  return (data ?? { success: false, message: '操作失败' }) as { success: boolean; message: string }
}

/** 装备标签（最多 3 个，传入 {v, c} 数组，c 为颜色或 null） */
export async function equipTags(tagData: TagData[]): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.rpc('equip_tags', { p_tag_values: tagData })
  if (error) return { success: false, message: error.message }
  return (data ?? { success: false, message: '操作失败' }) as { success: boolean; message: string }
}

/** 获取当前装备状态 */
export async function fetchUserEquipped(): Promise<UserDecoration> {
  const { data, error } = await supabase.rpc('get_user_equipped')
  if (error) return { color: null, tags: [] }
  return (data as UserDecoration) ?? { color: null, tags: [] }
}
