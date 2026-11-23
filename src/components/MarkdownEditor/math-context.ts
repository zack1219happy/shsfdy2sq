/**
 * math-context — 判断光标是否处在 LaTeX 公式语境里
 *
 * 只针对本项目实际启用的 markdown-it-texmath `dollars` 模式：
 *   - 行内：`$…$`（开标记后必须紧跟非空白）与 `$$…$$`
 *   - 块级：`$$⏎…⏎$$`（同一行闭合的 `$$…$$` 也算）
 * `\[…\]` 没有启用，不在此列。
 *
 * 纯字符扫描，不依赖任何解析器，可单独测试。
 */

export type MathContext = 'none' | 'inline' | 'block'

/** 公式里常见、普通文本里罕见的字符：出现即认为「用户确实在写公式」 */
const LATEX_HINT = /[\\^_{}=+\-*/<>()[\]|]/

/** 未转义的 `$` 前一个字符是反斜杠时视为转义（`\$`） */
function isEscaped(doc: string, pos: number): boolean {
  let backslashes = 0
  for (let i = pos - 1; i >= 0 && doc[i] === '\\'; i--) backslashes++
  return backslashes % 2 === 1
}

/**
 * 从文档开头扫到 pos，返回光标所处的公式状态。
 * 同时给出未闭合行内公式的开标记位置，便于调用方做启发式判断。
 */
function scan(doc: string, pos: number): { kind: MathContext; open: number } {
  let kind: MathContext = 'none'
  let open = -1
  let i = 0

  while (i < pos) {
    const ch = doc[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch !== '$') {
      i++
      continue
    }

    const marker = doc[i + 1] === '$'
    if (kind === 'block') {
      // 块级公式只认 `$$` 收尾
      if (marker) {
        kind = 'none'
        i += 2
        continue
      }
      i++
      continue
    }
    if (kind === 'inline') {
      // 行内公式遇到任意 `$` 收尾
      kind = 'none'
      i += marker ? 2 : 1
      continue
    }

    if (marker) {
      kind = 'block'
      open = i
      i += 2
      continue
    }
    // 行内公式开标记：`$` 后紧跟非空白，否则当美元符号
    const next = doc[i + 1]
    if (next === undefined || /\s/.test(next)) {
      i++
      continue
    }
    kind = 'inline'
    open = i
    i++
  }

  return { kind, open }
}

/**
 * 光标是否在公式里（行内或块级）。
 *
 * 行内公式的判定在「未闭合」时会有歧义（`$5` 和 `$\frac{` 都只有一个 `$`），
 * 所以额外看两条证据：
 *   1. 开标记到光标之间的内容含公式特征字符（\ ^ _ { } = …）
 *   2. 光标右侧同一行还有闭合 `$`（如 `$x={…}$`，先把公式写完再回头填内容）
 * 两条都不满足就当作普通文本，避免把「$5 起 {表情}」这类价格误判成公式。
 */
export function insideMath(doc: string, pos: number): boolean {
  const { kind, open } = scan(doc, pos)
  if (kind === 'block') return true
  if (kind !== 'inline') return false

  const content = doc.slice(open + 1, pos)
  // 末尾的 `{` / `@` 是触发补全的字符本身，不能算作公式特征
  const body = /[{@]$/.test(content) ? content.slice(0, -1) : content
  if (LATEX_HINT.test(body)) return true
  // 行内公式不跨空行
  if (/\n[ \t]*\n/.test(body)) return false

  const rest = doc.slice(pos)
  const lineEnd = rest.indexOf('\n')
  const restOfLine = lineEnd === -1 ? rest : rest.slice(0, lineEnd)
  for (let i = 0; i < restOfLine.length; i++) {
    if (restOfLine[i] !== '$') continue
    if (isEscaped(restOfLine, i)) continue
    return true
  }
  return false
}
