import type { Heading } from './content'

/**
 * 从渲染后的 HTML 中提取标题（h2/h3）
 * 与 content.ts 中的 extractHeadingsFromHtml 保持一致
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
