/** 犇犇（微动态）—— 首页底部的碎碎念 */

/** 单条犇犇正文的字数上限 */
export const BENBEN_MAX_LENGTH = 300

export interface BenbenPost {
  id: string
  author_id: string
  author_username: string
  content: string
  created_at: string
  like_count: number
  liked_by_me: boolean
  /** 是不是自己发的 */
  is_mine: boolean
  /** 能不能删（作者本人，或 admin / super_admin） */
  can_delete: boolean
}
