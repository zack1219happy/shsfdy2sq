import type { Heading } from './content'

/**
 * 从渲染后的 HTML 中提取 h2/h3 标题，供 TableOfContents 使用。
 *
 * 解析 markdown-it 带 anchor 插件渲染出的 DOM：
 *   <h2 id="xxx">标题内容（可能含 <code> 等内联标签）</h2>
 *   <h3 id="yyy">...</h3>
 *
 * 与 content.ts 中的 extractHeadingsFromHtml 等效。
 */
export function extractHeadingsFromHtml(html: string): Heading[] {
  const headings: Heading[] = []
  const regex = /<h([23])\s+id="([^"]*)"[^>]*>(.*?)<\/h\1>/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const text = match[3].replace(/<[^>]*>/g, '').trim()
    headings.push({
      level: parseInt(match[1]),
      id: match[2],
      text,
    })
  }
  return headings
}
