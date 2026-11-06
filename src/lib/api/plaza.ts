'use client'

import { supabase } from '../supabase'
import type {
  PlazaArticleDetail,
  PlazaArticleListResult,
  PlazaArticleNavigation,
  PlazaCategory,
  PlazaCollectionDetail,
  PlazaFeedItem,
  PlazaTipRecord,
  SendPointsResult,
} from '@/types/plaza'

export type PlazaFeedSort =
  | 'created_at:desc' | 'created_at:asc'
  | 'updated_at:desc' | 'updated_at:asc'
  | 'latest_comment:desc' | 'latest_comment:asc'
  | 'likes:desc' | 'likes:asc'

/* =============================================================
   Plaza API — 文章广场
   - 分类从 plaza_categories 表动态读取，不再硬编码
   - 列表支持分类筛选、搜索、我写的/我赞的 标签页
   - 可见性只有公开 / 私密两态（is_public: boolean），
     没有论坛的 excluded_visibility 数组
   - 点赞走 toggle_plaza_like RPC（乐观更新）
   - 含积分奖励/投币/沙箱交互（award/tip/sendPoints/storage）
   ============================================================= */

/** 检测广场文章重复（客户端预检） */
export async function checkPlazaDuplicate(title: string, content: string): Promise<{ is_duplicate: boolean; existing_title: string; created_at: string } | null> {
  const { data, error } = await supabase.rpc('check_plaza_article_duplicate', {
    p_title: title.trim(),
    p_content: content.trim(),
  })
  if (error) return null
  return (data ?? [])[0] ?? null
}

/** get_plaza_articles RPC 原始行（含 upvote_count，需映射为 like_count） */
type PlazaArticleRow = PlazaArticleListResult & {
  upvote_count?: number | null
}

/** get_plaza_article RPC 原始行 */
type PlazaArticleDetailRow = PlazaArticleDetail & {
  upvote_count?: number | null
}

type PlazaFeedRow = {
  result_type: 'article' | 'collection'
  id: string | null
  title: string
  slug: string | null
  category_id: string | null
  author_id: string
  author_username: string
  author_color: string | null
  is_public: boolean | null
  comment_count: number | null
  upvote_count: number | null
  downvote_count: number | null
  created_at: string
  updated_at: string
  is_awarded: boolean | null
  tip_count: number | null
  has_js: boolean | null
  collection_key: string | null
  collection_prefix: string | null
  collection_title: string | null
  collection_article_count: number | null
  collection_latest_article_title: string | null
  collection_latest_article_slug: string | null
}

type PlazaCollectionRow = {
  collection_key: string
  collection_title: string
  author_id: string
  author_username: string
  author_color: string | null
  article_count: number
  id: string
  title: string
  slug: string
  category_id: string
  is_public: boolean
  comment_count: number
  upvote_count: number
  downvote_count: number
  created_at: string
  updated_at: string
  is_awarded: boolean
  tip_count: number
  has_js: boolean
}

type PlazaArticleNavigationRow = PlazaArticleNavigation

/** 获取所有分类（扁平列表，前端自行构建树结构） */
export async function fetchPlazaCategories(): Promise<PlazaCategory[]> {
  const { data, error } = await supabase.rpc('get_plaza_categories')
  if (error) throw new Error('获取分类失败: ' + error.message)
  return (data ?? []) as PlazaCategory[]
}

/** 获取文章广场混合列表：普通文章 + 集锦卡片 */
export async function fetchPlazaFeed(
  categoryId?: string,
  search?: string,
  limit = 50,
  offset = 0,
  my?: boolean,
  liked?: boolean,
  sort: PlazaFeedSort = 'created_at:desc',
  expandCollections = false,
): Promise<PlazaFeedItem[]> {
  const [sortBy, sortOrder] = sort.split(':')
  const params: Record<string, string | number | boolean | null> = {
    p_category_id: categoryId || null,
    p_search: search || null,
    p_limit: limit,
    p_offset: offset,
    p_my: my === true,
    p_liked: liked === true,
    p_sort_by: sortBy,
    p_sort_order: sortOrder,
    p_expand_collections: expandCollections,
  }
  const { data, error } = await supabase.rpc('get_plaza_feed_options', params)
  if (error) throw new Error('获取文章广场失败: ' + error.message)

  return ((data ?? []) as PlazaFeedRow[]).map((row): PlazaFeedItem => {
    if (row.result_type === 'collection') {
      return {
        result_type: 'collection',
        collection_key: row.collection_key ?? `${row.author_id}:${row.collection_title ?? ''}`,
        collection_prefix: row.collection_prefix ?? row.collection_title ?? '',
        collection_title: row.collection_title ?? row.title,
        collection_author_id: row.author_id,
        collection_author_username: row.author_username,
        collection_author_color: row.author_color,
        collection_article_count: row.collection_article_count ?? 0,
        collection_latest_article_title: row.collection_latest_article_title ?? '',
        collection_latest_article_slug: row.collection_latest_article_slug ?? '',
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    }

    const isCollectionMember = Boolean(row.collection_key && row.collection_title && (row.collection_article_count ?? 0) >= 2)
    return {
      result_type: 'article',
      id: row.id ?? '',
      title: row.title,
      slug: row.slug ?? '',
      category_id: row.category_id ?? '',
      author_id: row.author_id,
      author_username: row.author_username,
      author_color: row.author_color,
      is_public: row.is_public ?? false,
      comment_count: row.comment_count ?? 0,
      like_count: row.upvote_count ?? 0,
      downvote_count: row.downvote_count ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_awarded: row.is_awarded ?? false,
      tip_count: row.tip_count ?? 0,
      ...(isCollectionMember
        ? {
            collection_author_id: row.author_id,
            collection_prefix: row.collection_prefix ?? '',
            collection_article_count: row.collection_article_count ?? 0,
          }
        : {}),
    }
  })
}

/** 获取一个集锦的全部可见文章 */
export async function fetchPlazaCollection(authorId: string, prefix: string): Promise<PlazaCollectionDetail> {
  const { data, error } = await supabase.rpc('get_plaza_collection', {
    p_author_id: authorId,
    p_prefix: prefix,
  })
  if (error) throw new Error('获取集锦失败: ' + error.message)

  const rows = (data ?? []) as PlazaCollectionRow[]
  if (rows.length === 0 || rows[0].article_count < 2) {
    throw new Error('集锦不存在或没有可见文章')
  }

  const first = rows[0]
  return {
    collection_key: first.collection_key,
    collection_title: first.collection_title,
    author_id: first.author_id,
    author_username: first.author_username,
    author_color: first.author_color,
    article_count: first.article_count,
    articles: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      category_id: row.category_id,
      author_id: row.author_id,
      author_username: row.author_username,
      author_color: row.author_color,
      is_public: row.is_public,
      comment_count: row.comment_count,
      like_count: row.upvote_count,
      downvote_count: row.downvote_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_awarded: row.is_awarded,
      tip_count: row.tip_count,
    })),
  }
}

/** 获取当前文章所在集锦的上一篇/下一篇 */
export async function fetchPlazaArticleNavigation(articleId: string): Promise<PlazaArticleNavigation | null> {
  const { data, error } = await supabase.rpc('get_plaza_article_navigation', {
    p_article_id: articleId,
  })
  if (error) return null
  return ((data ?? []) as PlazaArticleNavigationRow[])[0] ?? null
}

export async function fetchPlazaArticles(
  categoryId?: string,
  search?: string,
  limit = 50,
  offset = 0,
  my?: boolean,
  liked?: boolean,
): Promise<PlazaArticleListResult[]> {
  const params: Record<string, string | number | boolean> = { p_limit: limit, p_offset: offset }
  if (categoryId) params.p_category_id = categoryId
  if (search) params.p_search = search
  if (my) params.p_my = true
  if (liked) params.p_liked = true
  const { data, error } = await supabase.rpc('get_plaza_articles', params)
  if (error) throw new Error('获取广场文章失败: ' + error.message)
  return ((data ?? []) as PlazaArticleRow[]).map((r: PlazaArticleRow) => ({
    ...r,
    like_count: r.upvote_count ?? r.like_count ?? 0,
    downvote_count: r.downvote_count ?? 0,
  })) as PlazaArticleListResult[]
}

export async function fetchPlazaArticle(slug: string): Promise<PlazaArticleDetail> {
  const { data, error } = await supabase.rpc('get_plaza_article', { p_slug: slug })
  if (error) throw new Error('获取文章失败: ' + error.message)
  const row = (data as PlazaArticleDetailRow[] | null)?.[0]
  if (!row) throw new Error('文章不存在')
  return {
    ...row,
    like_count: row.upvote_count ?? row.like_count ?? 0,
    downvote_count: row.downvote_count ?? 0,
  } as PlazaArticleDetail
}

export async function createPlazaArticle(
  title: string,
  slug: string,
  content: string,
  categoryId: string,
  isPublic: boolean,
  hasJs?: boolean,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_plaza_article', {
    p_title: title.trim(),
    p_slug: slug.trim(),
    p_content: content.trim(),
    p_category_id: categoryId,
    p_is_public: isPublic,
    p_has_js: hasJs ?? false,
  })
  if (error) throw new Error('发布文章失败: ' + error.message)
  return data as string
}

export async function updatePlazaArticle(
  id: string,
  title: string,
  content: string,
  categoryId: string,
  isPublic: boolean,
  hasJs?: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('update_plaza_article', {
    p_article_id: id,
    p_title: title.trim(),
    p_content: content.trim(),
    p_category_id: categoryId,
    p_is_public: isPublic,
    p_has_js: hasJs ?? false,
  })
  if (error) throw new Error('编辑失败: ' + error.message)
}

export async function deletePlazaArticle(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_plaza_article', { p_article_id: id })
  if (error) throw new Error('删除失败: ' + error.message)
}

export async function votePlazaArticle(articleId: string, voteType: 'up' | 'down'): Promise<void> {
  const { error } = await supabase.rpc('vote_plaza_article', {
    p_article_id: articleId,
    p_vote_type: voteType,
  })
  if (error) throw new Error('投票失败: ' + error.message)
}

export async function removePlazaVote(articleId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_plaza_vote', { p_article_id: articleId })
  if (error) throw new Error('取消投票失败: ' + error.message)
}

export async function getUserPlazaVote(articleId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_plaza_vote', { p_article_id: articleId })
  if (error) return null
  return data as string | null
}


/** 管理员奖励作者积分 */
export async function awardPlazaArticlePoints(articleId: string, amount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('award_plaza_article_points', {
    p_article_id: articleId,
    p_amount: amount,
  })
  if (error) throw new Error('奖励积分失败: ' + error.message)
  return !!data
}

/** 读者投币 */
export async function tipPlazaArticle(articleId: string, amount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('tip_plaza_article', {
    p_article_id: articleId,
    p_amount: amount,
  })
  if (error) throw new Error(error.message)
  return !!data
}

/* ── Plaza Sandbox API — 沙箱 JS 交互能力 ── */

/** 作者预埋悬赏：作者扣分 → 当前读者收分 */
export async function sendPlazaPoints(
  articleId: string,
  amount: number,
  articleCap: number,
  balanceFloor: number,
  oncePerUser = false,
): Promise<SendPointsResult> {
  const { data, error } = await supabase.rpc('send_plaza_points', {
    p_article_id: articleId,
    p_amount: amount,
    p_article_cap: articleCap,
    p_balance_floor: balanceFloor,
    p_once_per_user: oncePerUser,
  })
  if (error) return { success: false, message: error.message }
  return { success: data === true }
}

/** 获取文章收到的读者打赏记录 */
export async function fetchPlazaArticleTips(articleId: string): Promise<PlazaTipRecord[]> {
  const { data, error } = await supabase.rpc('get_plaza_article_tips', {
    p_article_id: articleId,
  })
  if (error) throw new Error('获取打赏记录失败: ' + error.message)
  return (data ?? []) as PlazaTipRecord[]
}

/** 读取当前用户在当前文章的持久化存储 */
export async function getPlazaStorage(articleId: string, key: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_plaza_storage', {
    p_article_id: articleId,
    p_key: key,
  })
  if (error) return null
  return (data as string) ?? null
}

/** 写入当前用户在当前文章的持久化存储 */
export async function setPlazaStorage(articleId: string, key: string, value: string): Promise<boolean> {
  const { error } = await supabase.rpc('set_plaza_storage', {
    p_article_id: articleId,
    p_key: key,
    p_value: value,
  })
  if (error) return false
  return true
}
