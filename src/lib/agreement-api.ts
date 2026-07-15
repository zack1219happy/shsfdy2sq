/**
 * agreement-api.ts — agreement 页面 API（无审核，管理员直写）
 *
 * 所有函数通过 Supabase RPC 调用。
 */

import { supabase } from './supabase'

export interface AgreementPage {
  slug: string
  title: string
  content: string   // markdown
  updated_at: string
}

// ── 获取单个 agreement 页面 ──

export async function fetchAgreementPage(slug: string): Promise<AgreementPage | null> {
  const { data, error } = await supabase.rpc('get_agreement_page', { p_slug: slug })
  if (error) throw new Error('获取 agreement 页面失败: ' + error.message)
  const pages = (data ?? []) as AgreementPage[]
  return pages[0] ?? null
}

// ── 获取所有 slug（用于 SSG params） ──

export async function fetchAgreementSlugs(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_agreement_slugs')
  if (error) throw new Error('获取 agreement slug 列表失败: ' + error.message)
  return (data ?? []).map((r: any) => r.slug)
}

// ── 更新 agreement 页面（管理员直写） ──

export async function updateAgreementPage(
  slug: string,
  title: string,
  content: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('update_agreement_page', {
    p_slug: slug,
    p_title: title,
    p_content: content,
  })
  if (error) throw new Error('更新 agreement 页面失败: ' + error.message)
  return data as boolean
}
