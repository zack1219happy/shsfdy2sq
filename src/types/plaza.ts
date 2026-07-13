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
 * 查找分类的完整路径（从根到叶的 name 数组）
 */
export function getCategoryPath(flat: PlazaCategory[], name: string): string[] {
  const map = new Map(flat.map((c) => [c.name, c] as const))
  const path: string[] = []
  let current: PlazaCategory | undefined = map.get(name)
  while (current) {
    path.unshift(current.name)
    current = current.parent_id ? flat.find((c) => c.id === current!.parent_id) : undefined
  }
  return path
}

/**
 * 根据分类名查找分类 ID
 */
export function getCategoryId(flat: PlazaCategory[], name: string): string | undefined {
  return flat.find((c) => c.name === name)?.id
}

/** 兼容旧代码的分类信息（name + subCategories，用于显示） */
export interface PlazaCategoryInfo {
  name: string
  /** null 表示无子类、直接页面 */
  subCategories: (string | null)[]
}

/**
 * 从扁平 DB 分类列表转换为旧版 PLAZA_CATEGORIES 格式
 * （用于过渡期兼容，后续可移除）
 */
export function toLegacyCategories(flat: PlazaCategory[]): PlazaCategoryInfo[] {
  const tree = buildCategoryTree(flat)
  return tree.map((cat) => ({
    name: cat.name,
    subCategories: cat.children.length > 0
      ? cat.children.map((c) => c.name)
      : [null],
  }))
}
