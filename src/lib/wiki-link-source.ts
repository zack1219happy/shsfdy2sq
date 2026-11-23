/* ============================================
   Wiki 链接解析表 —— 运行时刷新

   构建期会把「标题 → slug」映射烘进 src/data/person-registry.ts，
   但数据库里的页面是随时新增/改名的，快照一旦过期，
   [[新页面]] 就会退化成纯文本，要等下次部署才恢复。

   这里在客户端首次用到 [[...]] 时拉一次 get_all_wiki_pages
   （公开 RPC，导航树构建时也在用），把最新页面并进解析表并
   通知订阅者重渲染 —— 新页面立刻可链，不用重新构建。
   ============================================ */

'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { fetchAllWikiPages } from './wiki-api'
import { loadPersonRegistry } from './person-registry-source'
import { resolveText } from './people'

export type WikiLinkSource = Record<string, string>

/** 运行时拉到的「标题 → slug」，空表示还没拉到 */
let cached: WikiLinkSource | null = null
/** 上次成功拉取的时间戳：过期后挂载会后台刷新 */
let cachedAt = 0
let loading = false
const listeners = new Set<() => void>()

/** 缓存有效期：期内直接用缓存，过期则静默刷新（新页面不用重开浏览器） */
const CACHE_TTL_MS = 30_000

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): WikiLinkSource | null {
  return cached
}

/** 当前运行时映射（还没拉到 / 拉取失败时为 null） */
export function getWikiLinkSource(): WikiLinkSource | null {
  return cached
}

/** 服务端渲染 / 初次 hydration 时用构建期快照，避免水合不一致 */
function getServerSnapshot(): WikiLinkSource | null {
  return null
}

/**
 * 拉取最新页面列表。
 *
 * 缓存 30 秒内直接复用；过期后重新拉（stale-while-revalidate：
 * 拉取期间仍然用旧映射，成功后通知订阅者重渲染）。
 * 并发调用只会产生一次请求。
 */
export async function loadWikiLinkSource(): Promise<void> {
  if (loading) return
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return
  loading = true
  try {
    const pages = await fetchAllWikiPages()
    // 标题里的 [stu:x] 要按最新注册表解析，所以先等注册表就绪
    const personRegistry = await loadPersonRegistry()
    const map: WikiLinkSource = {}
    for (const page of pages) {
      const slug = String(page.slug ?? '').replace(/^\/+|\/+$/g, '')
      const title = String(page.title ?? '').trim()
      if (!slug || !title) continue
      map[title] = slug
      // 标题里的 [stu:x] 渲染后显示的是缩写：链接文字与可匹配文本都用解析后的标题
      const resolved = resolveText(title, personRegistry).trim()
      if (resolved && resolved !== title) {
        delete map[title]
        map[resolved] = slug
      }
    }
    if (Object.keys(map).length === 0) return
    cached = map
    cachedAt = Date.now()
    for (const listener of [...listeners]) listener()
  } catch {
    // 网络/权限失败：继续用构建期快照，下次挂载再试
  } finally {
    loading = false
  }
}

/**
 * 返回「构建期快照 + 运行时最新页面」合并后的解析表。
 *
 * - 挂载时触发一次拉取（全局去重，不随组件数量增加请求数）
 * - 拉到以后，指向已删除页面的旧快照条目会被丢弃
 * - 没拉到 / 拉取失败时，行为与改动前完全一致
 */
export function useWikiLinkSource(fallback: WikiLinkSource): WikiLinkSource {
  const fresh = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    void loadWikiLinkSource()
  }, [])

  return useMemo(() => {
    if (!fresh) return fallback
    const liveSlugs = new Set(Object.values(fresh))
    const merged: WikiLinkSource = {}
    for (const [title, slug] of Object.entries(fallback)) {
      if (liveSlugs.has(slug)) merged[title] = slug
    }
    return { ...merged, ...fresh }
  }, [fresh, fallback])
}
