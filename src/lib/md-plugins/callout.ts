import type MarkdownIt from 'markdown-it'

// ============================================================
// Callout 插件（> [!note] / > [!warning] / > [!success] / > [!bug]）
// 从 content.ts 和 render-client.ts 提取的统一实现
// ============================================================

interface CalloutMeta {
  calloutType: string
  folding: string
  title: string
}

/**
 * markdown-it 插件：将 > [!type] 语法转为 callout div 或 details 折叠框
 *
 * 支持：
 *   > [!note]          → <div class="callout callout-note">
 *   > [!warning]- 标题 → <details class="callout callout-warning">（默认收起）
 *   > [!success]+ 标题 → <details class="callout callout-success" open>（默认展开）
 */
export function calloutPlugin(md: MarkdownIt): void {
  // Core Rule：在 inline 解析之前剥离标记行
  md.core.ruler.before('inline', 'callout_marker', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_close') break
        if (tokens[j].type === 'inline') {
          const m = tokens[j].content.match(
            /^\[!(\w+)]([-+]?)(?:[ \t]+([^\n]*))?(?:\n|$)/,
          )
          if (m) {
            ;(tokens[i] as any).meta = {
              calloutType: m[1].toLowerCase(),
              folding: m[2],
              title: (m[3] ?? '').trim(),
            } satisfies CalloutMeta
            tokens[j].content = tokens[j].content.slice(m[0].length)
          }
          break
        }
      }
    }
  })

  // Renderer 覆盖
  const origOpen = md.renderer.rules.blockquote_open
  const origClose = md.renderer.rules.blockquote_close
  const calloutStack: boolean[] = []

  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const meta = (tokens[idx] as any).meta as CalloutMeta | undefined
    if (meta?.calloutType) {
      const type = md.utils.escapeHtml(meta.calloutType)
      const folding = meta.folding
      const title = md.utils.escapeHtml(meta.title)
      const label = title || type.charAt(0).toUpperCase() + type.slice(1)

      if (folding === '-' || folding === '+') {
        calloutStack.push(true)
        const openAttr = folding === '+' ? ' open' : ''
        return `<details class="callout callout-${type}"${openAttr}><summary>${label}</summary>`
      }
      calloutStack.push(false)
      return `<div class="callout callout-${type}"><div class="callout-header">${label}</div>`
    }
    return origOpen ? origOpen(tokens, idx, opts, env, self) : '<blockquote>\n'
  }

  md.renderer.rules.blockquote_close = (tokens, idx, opts, env, self) => {
    if (calloutStack.length > 0) {
      return calloutStack.pop() ? '</details>\n' : '</div>\n'
    }
    return origClose
      ? origClose(tokens, idx, opts, env, self)
      : '</blockquote>\n'
  }
}
