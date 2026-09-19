/* ============================================
   表情 / 表情包 — 类型与库数据
   --------------------------------------------
   每个人的表情库彼此独立：渲染与补全都只认「内容作者」
   自己的库；同名表情在不同人的库里各自解析。
   ============================================ */

export interface EmojiItem {
  id: string
  name: string
  url: string
  hash: string
  /** 所属表情包显示名；散表情为 null */
  pack: string | null
  /** 所属表情包的 id（订阅整包时用） */
  pack_id: string | null
  /** 表情包在作者那边的原始名（复制时要用） */
  pack_source_name: string | null
  /** 这个表情归属的人（复制 / 禁用时以此为准） */
  source_user_id: string | null
  /** 图片指纹被管理员禁用 */
  banned: boolean
}

export interface EmojiPack {
  id: string
  /** 在我库里的显示名（订阅时可以自己起） */
  name: string
  /** 作者那边的原始名 */
  source_name: string
  source_user_id: string | null
  subscription_id: string | null
  subscribed: boolean
  emojis: EmojiItem[]
  subscribers: number
  created_at: string
}

export interface EmojiLibrary {
  emojis: EmojiItem[]
  packs: EmojiPack[]
}

export const EMPTY_LIBRARY: EmojiLibrary = { emojis: [], packs: [] }

/** 解析器：由渲染调用方注入（带内容作者身份）；返回 null 表示不渲染 */
export type EmojiResolver = (name: string, pack: string | null) => EmojiItem | null

/** 渲染时随 Markdown 一起传入的身份上下文 */
export interface EmojiContext {
  /** 内容作者 id；null（wiki / 公告等无主内容）则完全不解析表情语法 */
  userId: string | null
}

/** 渲染结果里的表情元数据，供右键菜单使用 */
export interface EmojiTarget {
  name: string
  pack: string | null
  packId: string | null
  packSourceName: string | null
  hash: string | null
  url: string | null
  /** 表情归属者（右键「加入我的表情」时的复制来源） */
  sourceUserId: string | null
  /** 是否处于禁用占位状态（管理员可右键解禁） */
  banned: boolean
}
