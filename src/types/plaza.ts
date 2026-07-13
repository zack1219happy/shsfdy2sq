/* ========== Plaza Types ========== */

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
  created_at: string
  updated_at: string
}

export interface PlazaArticleDetail extends PlazaArticle {
  content: string
}

export interface PlazaArticleListResult {
  id: string
  title: string
  slug: string
  category: string
  sub_category: string | null
  author_id: string
  author_username: string
  author_color: string | null
  is_public: boolean
  created_at: string
  updated_at: string
  heading_count: number
}

export const PLAZA_CATEGORIES = [
  { name: '学习笔记', subCategories: ['数学', '信息', null] },
  { name: '活动记录', subCategories: [null] },
  { name: '经验分享', subCategories: [null] },
  { name: '创作展示', subCategories: [null] },
] as const

export type PlazaCategory = (typeof PLAZA_CATEGORIES)[number]['name']
export type PlazaSubCategory = string | null
