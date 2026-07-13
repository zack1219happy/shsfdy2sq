/* ========== Plaza Types — 文章广场类型定义 ========== */

/** 文章列表项 / 文章详情（详情额外有 content） */
export interface PlazaArticle {
  id: string
  title: string
  slug: string
  category: string
  sub_category: string | null
  author_id: string
  author_username: string
  author_color: string | null
  is_public: boolean
  comment_count: number
  /** 赞数（API 返回 upvote_count，前端统一用 like_count） */
  like_count: number
  /** 踩数 */
  downvote_count: number
  created_at: string
  updated_at: string
}

export interface PlazaArticleDetail extends PlazaArticle {
  content: string
}

/** 广场评论（结构与 ForumComment 一致，只是 post_id → article_id） */
export interface PlazaComment {
  id: string
  article_id: string
  parent_id: string | null
  author_id: string
  author_username: string
  author_color: string | null
  content: string
  created_at: string
  deleted: boolean
}

/** 文章列表返回类型（与 PlazaArticle 一致） */
export type PlazaArticleListResult = PlazaArticle

/**
 * 分类定义
 * - 学习笔记：有子类（数学 / 信息 / 其他）
 * - 活动记录、经验分享、创作展示：无子类（subCategories: [null] 表示直接页面）
 */
export const PLAZA_CATEGORIES = [
  { name: '学习笔记', subCategories: ['数学', '信息', '其他'] },
  { name: '活动记录', subCategories: [null] },
  { name: '经验分享', subCategories: [null] },
  { name: '创作展示', subCategories: [null] },
] as const

export type PlazaCategory = (typeof PLAZA_CATEGORIES)[number]['name']
export type PlazaSubCategory = string | null
