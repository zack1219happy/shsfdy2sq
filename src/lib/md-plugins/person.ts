import type MarkdownIt from 'markdown-it'
import type { PersonRegistry } from '../people'
import { resolvePerson } from '../people'

// ============================================================
// Person 引用插件 — [stu:xxx] / [usr:xxx] / [tch:xxx] / [per:xxx]
// ============================================================

type TokenContent = { text: string } | { link: string; text: string }

/**
 * markdown-it 内联规则：
 *   [stu:xxx]  / [usr:xxx] → 学生
 *   [tch:xxx]              → 教师
 *   [per:xxx]              → 外部人员，纯文本透传
 */
export function personPlugin(md: MarkdownIt, registry: PersonRegistry): void {
  md.inline.ruler.after('text', 'person_ref', (state, silent) => {
    const pos = state.pos
    const src = state.src
    const max = state.posMax

    // 必须以 '[' 开头
    if (pos >= max || src.charCodeAt(pos) !== 0x5B) return false
    // 不能紧跟在反斜杠后（转义）
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x5C) return false

    // 匹配 [stu:  [usr:  [tch:  [per:
    let type: string | null = null
    let prefixLen = 0

    const p5 = src.slice(pos, pos + 5)
    if (p5 === '[stu:' || p5 === '[usr:') {
      type = p5 === '[stu:' ? 'stu' : 'usr'
      prefixLen = 5
    } else if (p5 === '[tch:') {
      type = 'tch'
      prefixLen = 5
    } else if (src.slice(pos, pos + 5) === '[per:') {
      type = 'per'
      prefixLen = 5
    }

    if (!type) return false

    // 查找闭合 ]
    const endBracket = src.indexOf(']', pos + prefixLen)
    if (endBracket === -1 || endBracket > max) return false

    const input = src.slice(pos + prefixLen, endBracket).trim()
    if (!input) return false

    if (!silent) {
      try {
        const resolved = resolvePerson(input, type, registry)

        if (type === 'per') {
          // [per:xxx] — 纯文本透传
          const token = state.push('text', '', 0)
          token.content = resolved.displayText
        } else {
          // [stu:xxx] / [tch:xxx] — 渲染为链接
          const token = state.push('link_open', 'a', 1)
          token.attrs = [
            ['href', resolved.href],
            ['class', `person-link person-${type}`],
          ]

          const textToken = state.push('text', '', 0)
          textToken.content = resolved.displayText

          state.push('link_close', 'a', -1)
        }
      } catch (e) {
        // 解析失败：以纯文本输出原始语法
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
          console.warn(`[PersonPlugin] ${(e as Error).message}`)
        }
        const textToken = state.push('text', '', 0)
        textToken.content = `[${type}:${input}]`
      }
    }

    state.pos = endBracket + 1
    return true
  })
}
