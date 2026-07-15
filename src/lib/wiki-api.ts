/**
 * wiki-api.ts — 客户端用 wiki 编辑 & 审核 API
 *
 * 所有函数通过 Supabase RPC 调用。
 */

import { supabase } from './supabase'

// ── 类型 ──

export interface WikiPage {
  slug: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
  revision: number
  updated_at: string
  updated_by: string | null
}

export interface WikiRevision {
  id: string
  slug: string
  page_title: string
  title: string
  author_id: string
  author_username: string
  author_name: string
  status: string
  base_revision: number
  current_revision: number
  created_at: string
  reviewed_at?: string
  review_comment?: string
  is_conflict: boolean
}

export interface RevisionDetail {
  id: string
  slug: string
  page_title: string
  title: string
  content: string
  frontmatter: Record<string, unknown>
  author_id: string
  author_username: string
  author_name: string
  status: string
  base_revision: number
  current_revision: number
  current_title: string
  current_content: string
  current_frontmatter: Record<string, unknown>
  created_at: string
  reviewed_at?: string
  review_comment?: string
  is_conflict: boolean
}

// ── 获取 wiki 页面 ──

export async function fetchWikiPage(slug: string): Promise<WikiPage | null> {
  const { data, error } = await supabase.rpc('get_wiki_page', { p_slug: slug })
  if (error) throw new Error('获取页面失败: ' + error.message)
  return (data as WikiPage[])?.[0] ?? null
}

// ── 提交编辑 ──

export async function submitWikiRevision(
  slug: string,
  title: string,
  content: string,
  frontmatter?: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.rpc('submit_wiki_revision', {
    p_slug: slug,
    p_title: title,
    p_content: content,
    p_frontmatter: frontmatter ?? {},
  })
  if (error) throw new Error('提交失败: ' + error.message)
  return data as string
}

// ── 获取待审核列表（admin） ──

export async function fetchPendingRevisions(): Promise<WikiRevision[]> {
  const { data, error } = await supabase.rpc('get_pending_revisions')
  if (error) throw new Error('获取待审核列表失败: ' + error.message)
  return (data ?? []) as WikiRevision[]
}

// ── 获取所有修订（admin） ──

export async function fetchAllRevisions(status?: string): Promise<WikiRevision[]> {
  const { data, error } = await supabase.rpc('get_all_revisions', { p_status: status ?? null })
  if (error) throw new Error('获取修订列表失败: ' + error.message)
  return (data ?? []) as WikiRevision[]
}

// ── 获取修订详情（admin） ──

export async function fetchRevisionDetail(id: string): Promise<RevisionDetail | null> {
  const { data, error } = await supabase.rpc('get_revision_detail', { p_revision_id: id })
  if (error) throw new Error('获取修订详情失败: ' + error.message)
  return (data as RevisionDetail[])?.[0] ?? null
}

// ── 批准修订（admin） ──

export async function approveWikiRevision(
  revisionId: string,
  opts?: { title?: string; content?: string; frontmatter?: Record<string, unknown> },
): Promise<boolean> {
  const { data, error } = await supabase.rpc('approve_wiki_revision', {
    p_revision_id: revisionId,
    p_title: opts?.title ?? null,
    p_content: opts?.content ?? null,
    p_frontmatter: opts?.frontmatter ?? null,
  })
  if (error) throw new Error('批准失败: ' + error.message)
  return data as boolean
}

// ── 驳回修订（admin） ──

export async function rejectWikiRevision(
  revisionId: string,
  comment?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('reject_wiki_revision', {
    p_revision_id: revisionId,
    p_comment: comment ?? '',
  })
  if (error) throw new Error('驳回失败: ' + error.message)
  return data as boolean
}

// ── 获取自己的 pending ──

export async function fetchMyPendingRevisions(): Promise<{ id: string; slug: string; page_title: string; status: string; created_at: string }[]> {
  const { data, error } = await supabase.rpc('get_my_pending_revisions')
  if (error) throw new Error('获取我的修订失败: ' + error.message)
  return (data ?? []) as any[]
}

// ── 获取指定页面的自己的 pending ──

export async function fetchUserPendingRevision(slug: string): Promise<{ id: string; title: string; content: string; created_at: string } | null> {
  const { data, error } = await supabase.rpc('get_user_pending_revision', { p_slug: slug })
  if (error) throw new Error('获取我的待审核失败: ' + error.message)
  return (data as any[])?.[0] ?? null
}

// ── 获取页面图片资源（base64） ──

export interface WikiAsset {
  filename: string
  mime_type: string
  data: string   // base64
  size: number
}

// ── 获取所有 wiki slug（用于 SSG params） ──

export async function fetchWikiSlugs(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_wiki_slugs')
  if (error) throw new Error('获取 wiki slug 列表失败: ' + error.message)
  return (data ?? []).map((r: any) => r.slug)
}

// ── 获取所有 wiki 页面（用于导航树） ──

export interface WikiPageNav {
  slug: string
  title: string
  frontmatter: Record<string, unknown>
}

export async function fetchAllWikiPages(): Promise<WikiPageNav[]> {
  const { data, error } = await supabase.rpc('get_all_wiki_pages')
  if (error) throw new Error('获取所有 wiki 页面失败: ' + error.message)
  return (data ?? []) as WikiPageNav[]
}

export async function fetchPageAssets(slug: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('get_page_assets', { p_slug: slug })
  if (error) throw new Error('获取图片资源失败: ' + error.message)
  const assets = (data ?? []) as WikiAsset[]
  const map = new Map<string, string>()
  for (const a of assets) {
    map.set(a.filename, `data:${a.mime_type};base64,${a.data}`)
  }
  return map
}
