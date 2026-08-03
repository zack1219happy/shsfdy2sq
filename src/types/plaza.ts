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
  /** 是否已被管理员奖励积分 */
  is_awarded?: boolean
  /** 累计收到投币积分 */
  tip_count?: number
}

export interface PlazaArticleDetail extends PlazaArticle {
  content: string
  /** 文章是否启用了 JS（跳过 DOMPurify） */
  has_js?: boolean
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

/** 沙箱 JS getUserInfo() 返回值（未登录为 null） */
export interface PlazaUserInfo {
  username: string
  student_id: string
  total_points: number
}

/** 文章打赏记录（getArticleTips 返回项） */
export interface PlazaTipRecord {
  username: string
  amount: number
  created_at: string
}

/** sendPoints 返回值 */
export interface SendPointsResult {
  success: boolean
  message?: string
}

/** 沙箱持久化存储接口（per 读者 per 文章，value 为字符串） */
export interface PlazaStorageApi {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<boolean>
}

/** 暴露给沙箱 JS 的全局 API（window.plazaAPI） */
export interface PlazaAPI {
  /** 当前读者信息；未登录返回 null */
  getUserInfo: () => Promise<PlazaUserInfo | null>
  /** 调整当前 sandbox iframe 高度（像素） */
  setWindowHeight: (height: number) => void
  /**
   * 作者预埋悬赏：作者扣分 → 当前读者收分
   * @param amount 本次发放量
   * @param articleCap 该文章累计发放上限
   * @param balanceFloor 作者余额保底线（发完须 ≥ 该值）
   * @param oncePerUser 为 true 时每读者仅限领取一次
   */
  sendPoints: (amount: number, articleCap: number, balanceFloor: number, oncePerUser?: boolean) => Promise<SendPointsResult>
  /** 该文章收到的读者打赏记录 */
  getArticleTips: () => Promise<PlazaTipRecord[]>
  storage: PlazaStorageApi
}


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
