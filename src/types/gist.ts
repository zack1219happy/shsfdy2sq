export interface Comment {
  id: string
  page: string
  author: string
  content: string
  date: string
  parentId?: string
  status: 'pending' | 'approved' | 'rejected'
  userId?: string
  authorColor?: string
  deleted?: boolean
}

export interface CommentsData {
  [pageSlug: string]: Comment[]
}

export interface EditSuggestion {
  id: string
  page: string
  type: 'edit' | 'new'
  title: string
  content: string
  reason: string
  author: string
  date: string
  status: 'pending' | 'approved' | 'rejected'
}

/* ========== Forum Types ========== */

export interface ForumPost {
  id: string
  title: string
  content: string
  author_id: string
  author_username: string
  author_color: string | null
  created_at: string
  updated_at: string
  upvotes: number
  downvotes: number
  comment_count: number
  excluded_visibility?: string[] | null
}

export interface UserInfo {
  id: string
  username: string
  name: string
  student_id?: string
  color?: string | null
}

export interface ForumComment {
  id: string
  post_id: string
  parent_id: string | null
  author_id: string
  author_username: string
  author_color: string | null
  content: string
  created_at: string
  deleted: boolean
}

export type NotificationType = 'comment_reply' | 'page_owner' | 'forum_reply' | 'forum_post_update' | 'forum_own_post' | 'dm' | 'wish_reply' | 'wish_status_update'

export interface ForumNotification extends Notification {
  type: NotificationType
}

export type ForumView = 'list' | 'new' | 'post'

/* ========== Points Types — 积分相关类型 ========== */

export interface TodayProgress {
  checked_in: boolean
  comments_today: number
  posts_today: number
  total_points: number
}

export interface PointsTransaction {
  id: string
  amount: number
  reason: 'checkin' | 'comment' | 'forum_post' | 'plaza_article' | 'wish_done' | 'purchase' | 'wish_payment'
  reference_id: string | null
  created_at: string
}

/** reason 中文映射 */
export const POINTS_REASON_LABEL: Record<string, string> = {
  checkin: '打卡',
  comment: '评论',
  forum_post: '论坛发帖',
  plaza_article: '文章奖励',
  wish_done: '许愿完成',
  purchase: '商城消费',
  wish_payment: '许愿消费',
}

/* ========== Shop Types — 积分商城 ========== */

export interface ShopItem {
  id: string
  item_type: 'color' | 'tag'
  name: string
  value: string
  price: number
  tag_color: string | null
}

export interface UserPurchase {
  item_id: string
  item_type: 'color' | 'tag'
  name: string
  value: string
  tag_color: string | null
  purchased_at: string
}

export interface UserDecoration {
  color: string | null
  tags: string[]
}

/** 内置身份 Tag（不消耗槽位，不可卸装） */
export const BUILTIN_TAGS: Record<string, string[]> = {
  'Zack-wz': ['创始人'],
  'Irade-tqy': ['工程师'],
}

/** 自定义 tag 的商品 value（用于识别） */
export const CUSTOM_TAG_VALUE = '__custom__'
