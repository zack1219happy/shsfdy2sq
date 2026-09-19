import type MarkdownIt from 'markdown-it'
import type { EmojiItem } from '../emoji/types'
import type { EmojiResolver } from '../emoji/types'

/* ============================================
   表情插件 — {表情名} / {表情包名:表情名}

   只有「内容作者自己的库里确实存在这个名字」才渲染，
   否则原样保留文字（历史内容零风险）。
   与文字同行 → 行内；单独成行 → 由 emoji_block_class
   规则给段落加 md-emoji-line，CSS 里放大一号。
   ============================================ */

/** 单个名称长度上限（表情名 / 包名各 ≤20，留足余量） */
const MAX_NAME = 24

const ESCAPED: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ESCAPED[ch] ?? ch)
}

export function emojiPlugin(md: MarkdownIt, resolve: EmojiResolver): void {
  md.inline.ruler.after('text', 'emoji_syntax', (state, silent) => {
    const pos = state.pos
    const src = state.src
    const max = state.posMax

    if (pos >= max || src.charCodeAt(pos) !== 0x7b /* { */) return false
    // 反斜杠转义
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x5c) return false

    const close = src.indexOf('}', pos + 1)
    if (close === -1 || close > max) return false

    const inner = src.slice(pos + 1, close)
    if (!inner || inner.length > MAX_NAME * 2 + 1) return false
    if (/[\n\r{}]/.test(inner) || inner !== inner.trim() || /\s/.test(inner)) return false

    const colon = inner.indexOf(':')
    let pack: string | null = null
    let name = inner
    if (colon >= 0) {
      pack = inner.slice(0, colon)
      name = inner.slice(colon + 1)
    }
    if (!name || name.length > MAX_NAME) return false
    if (pack !== null && (pack === '' || pack.length > MAX_NAME)) return false

    let item: EmojiItem | null = null
    try {
      item = resolve(name, pack)
    } catch {
      item = null
    }
    if (!item) return false

    if (!silent) {
      const token = state.push('emoji', '', 0)
      token.meta = { item, name, pack }
    }
    state.pos = close + 1
    return true
  })

  md.renderer.rules.emoji = (tokens, idx) => {
    const meta = tokens[idx].meta as { item: EmojiItem; name: string; pack: string | null }
    const item = meta.item

    if (item.banned) {
      // 违规禁用：只显示占位，不显示原始输入与图片
      return `<span class="md-emoji md-emoji-banned" data-emoji-banned="1"${
        item.hash ? ` data-emoji-hash="${escapeAttr(item.hash)}"` : ''
      }>违规表情</span>`
    }

    const attrs = (['data-emoji-name', 'data-emoji-hash', 'data-emoji-url',
      'data-emoji-source-pack', 'data-emoji-source-pack-id', 'data-emoji-source-pack-name',
      'data-emoji-source-user', 'data-emoji-id']
      .map((key) => {
        const value =
          key === 'data-emoji-name' ? meta.name
          : key === 'data-emoji-hash' ? item.hash
          : key === 'data-emoji-url' ? item.url
          : key === 'data-emoji-source-pack' ? item.pack
          : key === 'data-emoji-source-pack-id' ? item.pack_id
          : key === 'data-emoji-source-pack-name' ? item.pack_source_name
          : key === 'data-emoji-source-user' ? item.source_user_id
          : item.id
        return value ? `${key}="${escapeAttr(String(value))}"` : ''
      })
      .filter(Boolean)
      ).join(' ')

    return (
      `<span class="md-emoji"${attrs ? ' ' + attrs : ''}>` +
      `<img class="md-emoji-img" src="${escapeAttr(item.url)}" alt="${escapeAttr(meta.name)}" loading="lazy">` +
      `</span>`
    )
  }

  // 整段只有表情（与空白）时给段落加类 → CSS 放大一号
  md.core.ruler.after('inline', 'emoji_block_class', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'paragraph_open') continue
      const next = state.tokens[state.tokens.indexOf(token) + 1]
      const children = next?.children || []
      let hasEmoji = false
      let onlyEmoji = true
      for (const child of children) {
        if (child.type === 'emoji') { hasEmoji = true; continue }
        if (child.type === 'softbreak' || child.type === 'hardbreak') continue
        if (child.type === 'text' && child.content.trim() === '') continue
        onlyEmoji = false
        break
      }
      if (hasEmoji && onlyEmoji) token.attrJoin('class', 'md-emoji-line')
    }
    return true
  })
}
