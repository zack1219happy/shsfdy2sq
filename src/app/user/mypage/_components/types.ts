/** 用户主页共享类型与工具 */

export type Tab = 'home' | 'posts' | 'articles' | 'follows' | 'packs'
export type FollowState = 'none' | 'following' | 'mutual'
export type PrivacyLevel = 'public' | 'friends' | 'private'

export interface PrivacySettings {
    heatmap: PrivacyLevel
    stats: PrivacyLevel
    posts: PrivacyLevel
    articles: PrivacyLevel
    follows: PrivacyLevel
}

export interface DailyPoints {
    date: string
    points: number
}

export interface UserStats {
    currentPoints: number
    postsCount: number
    articlesCount: number
    commentsCount: number
    pageEditsCount: number
    wishesCount: number
}

export interface ForumPostItem {
    id: string
    title: string
    content: string
    created_at: string
    upvotes: number
    downvotes: number
    comment_count: number
}

export interface PlazaArticleItem {
    id: string
    title: string
    content: string
    slug: string
    created_at: string
    upvote_count: number
    downvote_count: number
    comment_count: number
    is_public: boolean
}

export interface FollowUser {
    id: string
    username: string
    name: string
    color: string | null
    followed_at: string
}

export interface UserProfile {
    id: string
    username: string
    name: string
    role: string
    student_id?: string | null
    motto: string
    bio: string
    color: string | null
    equipped_tags: unknown[]
    privacy_heatmap: PrivacyLevel
    privacy_stats: PrivacyLevel
    privacy_posts: PrivacyLevel
    privacy_articles?: PrivacyLevel
    privacy_follows: PrivacyLevel
}

export interface ConversationSummary {
    conversation_id: string
    other_user_id: string
}

/** 判断字符串是否为 UUID（用户主页 URL 参数按此区分 ID / 用户名） */
export const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** 热力图等级 (0–5) */
export function getHeatmapLevel(points: number): number {
    if (points === 0) return 0
    if (points <= 2) return 1
    if (points <= 6) return 2
    if (points <= 12) return 3
    if (points <= 24) return 4
    return 5
}
