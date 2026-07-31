import type MarkdownIt from 'markdown-it'

/**
 * markdown-it 插件：支持 ```sandbox 围栏块
 *
 * 将 ```sandbox``` 包裹的原始 HTML/CSS/JS 渲染为：
 *   <div class="js-sandbox" data-payload="URL 编码的原始内容">
 *
 * 后续由 WikiContent 在客户端根据模式处理：
 * - 安全模式 → 替换为代码块（显示源码，可复制）
 * - JS 模式  → 替换为 <iframe srcdoc>（浏览器原生执行脚本）
 *
 * 其他语言的围栏块不受影响，走默认 fence 渲染。
 */
export function sandboxBlockPlugin(md: MarkdownIt): void {
    const defaultFence = md.renderer.rules.fence

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const info = token.info ? token.info.trim().toLowerCase() : ''

        if (info === 'sandbox') {
            const encoded = encodeURIComponent(token.content)
            return `<div class="js-sandbox" data-payload="${encoded}"></div>\n`
        }

        return defaultFence
            ? defaultFence(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options)
    }
}
