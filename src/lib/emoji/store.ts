/* ============================================
   表情 / 表情包 — 客户端接口与内存缓存
   --------------------------------------------
   渲染需要「内容作者」的库，而库是异步加载的：
   这里维护一份按用户 id 分片的缓存，加载完成后广播
   订阅者重新渲染（与 pinyin-init-db 同一套路）。
   ============================================ */
'use client'

import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { bumpContentContext } from '@/lib/content-context-bus'
import { EMPTY_LIBRARY, type EmojiLibrary, type EmojiPack } from './types'

/* ---------- 缓存 ---------- */

const cache = new Map<string, EmojiLibrary>()
const loading = new Map<string, Promise<EmojiLibrary>>()
const loadVersions = new Map<string, number>()

const bump = bumpContentContext

/** 同步读取缓存，未加载则返回 null（渲染时按纯文字降级） */
export function getLibrarySync(userId: string | null | undefined): EmojiLibrary | null {
  if (!userId) return null
  return cache.get(userId) ?? null
}

/** 预热：把某人的库提前拉进缓存 */
export async function loadLibrary(userId: string | null | undefined): Promise<EmojiLibrary> {
  if (!userId) return EMPTY_LIBRARY
  const hit = cache.get(userId)
  if (hit) return hit
  const pending = loading.get(userId)
  if (pending) return pending

  const version = (loadVersions.get(userId) ?? 0) + 1
  loadVersions.set(userId, version)
  const task = (async () => {
    try {
      const { data, error } = await supabase.rpc('emoji_get_library', { p_user_id: userId })
      if (error) {
        console.warn('[emoji] 加载表情库失败:', error.message)
        return EMPTY_LIBRARY
      }
      const lib = (data ?? EMPTY_LIBRARY) as EmojiLibrary
      const normalized: EmojiLibrary = {
        emojis: Array.isArray(lib.emojis) ? lib.emojis : [],
        packs: Array.isArray(lib.packs) ? lib.packs : [],
      }
      // An invalidation may have started a newer request while this one was in flight.
      if (loadVersions.get(userId) === version) {
        cache.set(userId, normalized)
        bump()
      }
      return normalized
    } finally {
      if (loadVersions.get(userId) === version) loading.delete(userId)
    }
  })()

  loading.set(userId, task)
  return task
}

/** 本地改动后失效缓存（自己的库改动只影响自己，但渲染别人的内容也可能用到） */
export function invalidateLibrary(userId?: string) {
  if (userId) {
    cache.delete(userId)
    loadVersions.set(userId, (loadVersions.get(userId) ?? 0) + 1)
    loading.delete(userId)
  }
  else {
    cache.clear()
    loading.clear()
    loadVersions.clear()
  }
  bump()
}

/** 当前登录用户 id（编辑器、右键菜单用） */
export function currentUserId(): string | null {
  return getSession()?.userId ?? null
}

/* ---------- 写接口 ---------- */

async function call<T>(rpc: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) throw new Error(error.message)
  return data as T
}

/** 登记一个上传好的表情（图片已在 Storage，哈希由客户端算） */
export async function uploadEmoji(input: {
  name: string
  url: string
  hash: string
  packId?: string | null
}): Promise<string> {
  const id = await call<string>('emoji_upload', {
    p_name: input.name,
    p_url: input.url,
    p_hash: input.hash,
    p_pack_id: input.packId ?? null,
  })
  invalidateLibrary(currentUserId() ?? undefined)
  return id
}

export async function createEmojiPack(name: string): Promise<string> {
  const id = await call<string>('emoji_create_pack', { p_name: name })
  invalidateLibrary(currentUserId() ?? undefined)
  return id
}

/** 删除表情 / 表情包（id 可能是表情也可能是包） */
export async function deleteEmoji(id: string): Promise<void> {
  await call<boolean>('emoji_delete', { p_emoji_id: id })
  invalidateLibrary()
}

/** 把表情移入我的某个包（null = 移出包变成散表情） */
export async function setEmojiPack(emojiId: string, packId: string | null): Promise<void> {
  await call<boolean>('emoji_set_pack', { p_emoji_id: emojiId, p_pack_id: packId })
  invalidateLibrary(currentUserId() ?? undefined)
}

/** 复制别人的单个表情（快照，之后完全归我） */
export async function copyEmoji(input: {
  sourceUserId: string
  name: string
  packName?: string | null
  newName: string
}): Promise<string> {
  const id = await call<string>('emoji_copy', {
    p_source_user_id: input.sourceUserId,
    p_name: input.name,
    p_pack_name: input.packName ?? null,
    p_new_name: input.newName,
  })
  invalidateLibrary(currentUserId() ?? undefined)
  return id
}

/** 订阅整包（引用，跟随作者更新，不可增删改） */
export async function subscribePack(packId: string, displayName: string): Promise<string> {
  const id = await call<string>('emoji_subscribe', { p_pack_id: packId, p_display_name: displayName })
  invalidateLibrary(currentUserId() ?? undefined)
  return id
}

export async function unsubscribePack(subscriptionId: string): Promise<void> {
  await call<boolean>('emoji_unsubscribe', { p_subscription_id: subscriptionId })
  invalidateLibrary(currentUserId() ?? undefined)
}

/** 管理员：按图片指纹禁用 */
export async function banEmoji(emojiId: string): Promise<void> {
  await call<boolean>('emoji_ban', { p_emoji_id: emojiId })
  invalidateLibrary()
}

/** 管理员：解禁某个指纹 */
export async function unbanEmoji(hash: string): Promise<void> {
  await call<boolean>('emoji_unban', { p_image_hash: hash })
  invalidateLibrary()
}

/** 用户主页卡片：某人创建的表情包（只读） */
export async function fetchUserPacks(username: string): Promise<EmojiPack[]> {
  const { data, error } = await supabase.rpc('emoji_user_packs', { p_username: username })
  if (error) throw new Error('获取表情包失败: ' + error.message)
  return (data ?? []) as EmojiPack[]
}
