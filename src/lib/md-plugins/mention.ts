import type MarkdownIt from 'markdown-it'

/* ============================================
   @ 提及插件 — 把 @用户名 渲染成可点击的用户名链接

   只有正文里的 @名字 是「真实用户名」时才渲染成链接：
   用户名白名单由调用方注入（站内已有全量用户口径，
   test / admin_wz 本来就不在里面）。
   邮箱（a@b.com）、代码里的 @ 一律不当成提及。
   ============================================ */

/** 与数据库端完全一致的字符集：以字母开头，1-32 位 */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}/

const ESCAPED: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ESCAPED[ch] ?? ch)
}

const INLINE_CODE = /(?:^|[^\\])(`+)([\s\S]*?[^`])\1(?!`)/g
const FENCED_CODE = /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n(?:\1|~*)[^\n]*$/gm

/**
 * 从正文里抽出「确实存在」的提及（按出现顺序去重）。
 * 编辑器插入候选时用它把正文里的历史 @ 一并补进候选。
 */
export function extractExistingMentions(content: string, known: Set<string>): string[] {
  if (!content) return []
  const masked = content
    .replace(FENCED_CODE, (m) => m.replace(/\S/g, ' '))
    .replace(INLINE_CODE, (m) => m.replace(/\S/g, ' '))

  const out: string[] = []
  const seen = new Set<string>()
  const re = /(^|[^0-9A-Za-z_.-])@([A-Za-z][A-Za-z0-9_-]{0,31})(?![0-9A-Za-z_.-])/g
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    const name = m[2]
    if (!known.has(name) || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

export function mentionPlugin(md: MarkdownIt, isKnownUser: (name: string) => boolean): void {
  md.inline.ruler.after('text', 'mention_syntax', (state, silent) => {
    const pos = state.pos
    const src = state.src
    const max = state.posMax

    if (pos >= max || src.charCodeAt(pos) !== 0x40 /* @ */) return false
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x5c) return false
    // 前一个字符不能是单词字符 / . / -（排除邮箱、路径、@ 在标识符中间）
    if (pos > 0 && /[0-9A-Za-z_.\-]/.test(src[pos - 1])) return false

    const rest = src.slice(pos + 1, Math.min(pos + 33, max))
    const m = NAME_RE.exec(rest)
    if (!m) return false
    const name = m[0]
    // 后面不能再跟标识符字符或点（邮箱 a@b.com 的 b 后面就是 .）
    const next = src[pos + 1 + name.length]
    if (next && /[0-9A-Za-z_.\-]/.test(next)) return false
    if (!isKnownUser(name)) return false

    if (!silent) {
      const token = state.push('mention', '', 0)
      token.meta = { name }
    }
    state.pos = pos + 1 + name.length
    return true
  })

  md.renderer.rules.mention = (tokens, idx) => {
    const name = (tokens[idx].meta as { name: string }).name
    return `<span class="md-mention" data-mention="${esc(name)}"></span>`
  }
}
