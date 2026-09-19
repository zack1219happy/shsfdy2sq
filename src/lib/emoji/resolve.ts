import type { EmojiItem, EmojiLibrary, EmojiResolver } from './types'

export type { EmojiResolver }

/* ============================================
   表情解析 — 在「某人的库」里按语法找表情
   --------------------------------------------
   {表情名}          → 只在该人的散表情里找
   {表情包名:表情名}  → 在该人的包里找（自己创建或订阅来的都算）
   ============================================ */

export function resolveEmoji(
  lib: EmojiLibrary | null,
  name: string,
  pack: string | null,
): EmojiItem | null {
  if (!lib) return null

  if (pack) {
    const target = lib.packs.find((p) => p.name === pack)
    if (!target) return null
    return target.emojis.find((e) => e.name === name) ?? null
  }

  return lib.emojis.find((e) => e.name === name) ?? null
}

/**
 * 创建渲染期解析器。
 * 没有身份（wiki / 公告）或库还没加载 → 返回 null，
 * 调用方据此完全不解析表情语法，原文照显示。
 */
export function createEmojiResolver(
  lib: EmojiLibrary | null,
  contextUserId: string | null,
): EmojiResolver | null {
  if (!lib || !contextUserId) return null
  return (name, pack) => resolveEmoji(lib, name, pack)
}
