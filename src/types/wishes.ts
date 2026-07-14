/* ========== Wishes Types — 许愿池类型定义 ========== */

/** 状态映射 */
export const WISH_STATUS_MAP: Record<string, string> = {
  pending_review: '等待查看',
  working: '处理需求',
  developing: '开发实现',
  testing: '公测+bugfix',
  done: '已完成',
  cancelled: '已取消',
}

export const WISH_TIER_MAP: Record<string, string> = {
  small: '小功能',
  medium: '中级开发',
  large: '大型开发',
}

export const WISH_TIER_OPTIONS = [
  { value: 'small', label: '小功能' },
  { value: 'medium', label: '中级开发' },
  { value: 'large', label: '大型开发' },
]

/** 列表项 */
export interface WishItem {
  id: string
  request_number: number
  description: string
  title: string | null
  content: string | null
  contact_type: string
  contact_detail: string | null
  model_preference: string
  extra_money: number
  api_budget_cap: number | null
  estimated_tier: string
  user_id: string | null
  status: string
  created_at: string
  updated_at: string
  paid_at: string | null
  estimated_hours: string | null
  estimated_stage: string | null
  points_paid: number
  /** v3 新增：提交者信息（由 JOIN wiki_users 返回） */
  author_username: string | null
  author_name: string | null
}

/** 评论 */
export interface WishComment {
  id: string
  wish_id: string
  parent_id: string | null
  author_id: string
  author_username: string
  author_color: string | null
  content: string
  created_at: string
  deleted: boolean
}
