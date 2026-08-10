import type MarkdownIt from 'markdown-it'
import katex from 'katex'

// ============================================================
// 洛谷折叠框插件（Luogu-style collapsible blocks）
//
// 语法（与洛谷一致）：
//   ::::info[我是标题]
//   内容
//   ::::
//
//   ::::info[我是默认展开的折叠框]{open}
//   使用 {open} 使折叠框默认展开。
//   ::::
//
//   类型：info / success / warning / error
//   标题支持 LaTeX（$$...$$）
//   嵌套：最内层 3 个冒号，每往外一层增加 1 个冒号。
//   ::::::warning[我是警告]
//   :::::warning[不要]
//   ::::warning[滥用]
//   :::warning[嵌套]
//   内容
//   :::
//   ::::
//   :::::
//   ::::::
//
// 渲染为 <details class="callout callout-{type}">，与 Obsidian callout
// 折叠框共用同一套样式，保证两边显示一致。
// ============================================================

interface LuoguMeta {
    type: string
    title: string
    open: boolean
}

export function luoguCollapsePlugin(md: MarkdownIt): void {
    md.block.ruler.before('fence', 'luogu_collapse', (state, startLine, endLine, silent) => {
        // 匹配开标记行：^:{3,} type [title] {open}
        const lineStart = state.bMarks[startLine] + state.tShift[startLine]
        const lineEnd = state.eMarks[startLine]
        const text = state.src.slice(lineStart, lineEnd)
        const openM = text.match(/^(:{3,})\s*(\w+)\s*(?:\[([^\]]*)\])?\s*(?:\{(\w+)\})?\s*$/)
        if (!openM) return false

        const colons = openM[1].length
        const meta: LuoguMeta = {
            type: openM[2].toLowerCase(),
            title: openM[3] ?? '',
            open: openM[4] === 'open',
        }

        if (silent) return true

        // 扫描到匹配的闭合行：纯冒号行，冒号数 == colons，且本层嵌套深度归零
        let nextLine = startLine + 1
        let depth = 0
        let found = false
        while (nextLine < endLine) {
            const ln = state.bMarks[nextLine] + state.tShift[nextLine]
            const lt = state.src.slice(ln, state.eMarks[nextLine]).trim()
            const innerOpen = lt.match(/^(:{3,})\s*\w+\s*(?:\[[^\]]*\])?\s*(?:\{\w+\})?\s*$/)
            const innerClose = lt.match(/^(:{3,})\s*$/)
            if (innerOpen) {
                depth++
            } else if (innerClose) {
                if (innerClose[1].length === colons && depth === 0) {
                    found = true
                    break
                }
                if (depth > 0) depth--
            }
            nextLine++
        }
        if (!found) return false

        // 内容 = 开标记之后、闭合行之前的原始 markdown（含嵌套折叠框）
        const token = state.push('luogu_collapse', '', 0)
        token.meta = meta
        token.map = [startLine, nextLine + 1]
        token.content = state.src.slice(state.bMarks[startLine + 1], state.bMarks[nextLine])
        state.line = nextLine + 1
        return true
    })

    // Renderer：<details class="callout callout-{type}"[ open]><summary>标题</summary>内容</details>
    md.renderer.rules['luogu_collapse'] = (tokens, idx) => {
        const meta = tokens[idx].meta as LuoguMeta
        const openAttr = meta.open ? ' open' : ''
        const type = md.utils.escapeHtml(meta.type)
        const titleHtml = renderTitleWithLatex(md, meta.title)
        const innerHtml = md.render(tokens[idx].content)
        return `<details class="callout callout-${type}"${openAttr}><summary>${titleHtml}</summary>\n${innerHtml}</details>\n`
    }
}

/**
 * 渲染折叠框标题：$$...$$ 用 KaTeX（display 模式），其余部分走 inline markdown。
 */
function renderTitleWithLatex(md: MarkdownIt, raw: string): string {
    const parts = raw.split(/\$\$(.+?)\$\$/g)
    let html = ''
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 1) {
            try {
                html += katex.renderToString(parts[i], { displayMode: true, throwOnError: false })
            } catch {
                html += '$$' + parts[i] + '$$'
            }
        } else if (parts[i]) {
            html += md.renderInline(parts[i])
        }
    }
    return html
}
