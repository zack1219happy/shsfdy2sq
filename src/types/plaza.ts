/* ========== Plaza Types — 文章广场类型定义 ========== */

/** 文章列表项 / 文章详情（详情额外有 content） */
export interface PlazaArticle {
  id: string
  title: string
  slug: string
  category_id: string
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
 * 数据库分类节点（扁平记录，前端构建树结构）
 */
export interface PlazaCategory {
  id: string
  name: string
  parent_id: string | null
  display_order: number
}

/** 带 children 的树节点 */
export interface PlazaCategoryTreeNode extends PlazaCategory {
  children: PlazaCategoryTreeNode[]
}

/**
 * 将扁平分类列表构建为树
 */
export function buildCategoryTree(flat: PlazaCategory[]): PlazaCategoryTreeNode[] {
  const map = new Map<string, PlazaCategoryTreeNode>()
  const roots: PlazaCategoryTreeNode[] = []

  // 第一遍：创建所有节点
  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] })
  }

  // 第二遍：建立父子关系
  for (const node of map.values()) {
    if (node.parent_id) {
      const parent = map.get(node.parent_id)
      if (parent) {
        parent.children.push(node)
      } else {
        // parent 不存在就当根处理
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  }

  return roots
}

/**
 * 通过 category_id 查找分类的完整路径（从根到叶的 name 数组）
 */
export function getCategoryPathById(flat: PlazaCategory[], categoryId: string): string[] {
  const map = new Map(flat.map((c) => [c.id, c] as const))
  const path: string[] = []
  let current = map.get(categoryId)
  while (current) {
    path.unshift(current.name)
    current = current.parent_id ? map.get(current.parent_id) : undefined
  }
  return path
}
