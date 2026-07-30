import type MarkdownIt from 'markdown-it'

/**
 * markdown-it 已知的块级 HTML 标签（来自 CommonMark spec）
 * 这些标签 markdown-it 本身已正确处理，不需要拦截
 */
const KNOWN_BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote',
  'body', 'caption', 'center', 'col', 'colgroup', 'dd', 'details',
  'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'iframe',
  'legend', 'li', 'link', 'main', 'menu', 'menuitem', 'nav',
  'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search',
  'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'title', 'tr', 'track', 'ul',
])

/** 自闭合 HTML 标签（不需要 </tag> 结尾） */
const SELF_CLOSING_TAGS = new Set([
  'area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * markdown-it 插件：保护所有未被原生支持的 HTML 块标签
 *
 * markdown-it 只识别 CommonMark 规范中的块级 HTML 标签，
 * 其他标签（如 <svg>、<video>、<canvas>、<math>、自定义组件等）
 * 内部的缩进内容会被误解析为代码块或段落。
 *
 * 此插件在 html_block 和 code 规则之前拦截这类标签，
 * 找到匹配的闭合标签，将整个块作为原始 HTML 输出。
 */
export function rawHtmlBlockPlugin(md: MarkdownIt): void {
  md.block.ruler.before('html_block', 'raw_html_block', (state, startLine, endLine, silent) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine]
    const max = state.eMarks[startLine]
    const lineText = state.src.slice(pos, max)

    // 必须以 <tag 开头（不缩进 4+ 空格）
    const openMatch = lineText.match(/^<([a-zA-Z][a-zA-Z0-9.-]*)([\s>])/)
    if (!openMatch) return false
    if (state.sCount[startLine] - state.blkIndent >= 4) return false

    const tagName = openMatch[1].toLowerCase()

    // 跳过 markdown-it 已支持的块级标签
    if (KNOWN_BLOCK_TAGS.has(tagName)) return false

    // script/pre/style/textarea 由 markdown-it 的第一个 HTML_SEQUENCE 处理
    if (['script', 'pre', 'style', 'textarea'].includes(tagName)) return false

    // 自闭合标签不需要处理
    if (SELF_CLOSING_TAGS.has(tagName)) return false

    if (silent) return true

    // 检查当前行是否已经自闭合（如 <foo />）
    if (/\/\s*>$/.test(lineText.trim())) return false

    // 找到 </tagName> 结束行
    const closeRegex = new RegExp(`^</${tagName}\\s*>`, 'i')
    let nextLine = startLine + 1
    let foundClose = false
    while (nextLine < endLine) {
      const linePos = state.bMarks[nextLine] + state.tShift[nextLine]
      const text = state.src.slice(linePos, state.eMarks[nextLine])
      if (closeRegex.test(text.trim())) {
        nextLine++
        foundClose = true
        break
      }
      nextLine++
    }

    // 没找到闭合标签就不处理（fallback 给其他规则）
    if (!foundClose) return false

    // 提取整个块内容（保留原始缩进）
    const startPos = state.bMarks[startLine]
    const endPos = state.eMarks[nextLine - 1]
    const content = state.src.slice(startPos, endPos)

    const token = state.push('html_block', '', 0)
    token.content = content
    token.map = [startLine, nextLine]
    state.line = nextLine
    return true
  })
}
