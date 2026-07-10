'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

const initialMd = `# Hello Markdown

这是一段 **测试文本**。

## 功能列表

- 粗体、斜体、删除线
- 标题（H1-H6）
- 无序/有序列表
- 插入链接、图片、表格、代码块
- 实时预览
- 双向滚动同步

## 数学公式

行内公式 $E = mc^2$

块级公式：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$
`

export default function EditorDemoPage() {
  const [content, setContent] = useState(initialMd)

  return (
    <div style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px',
      height: 'calc(100vh - 48px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h1 style={{ marginBottom: '16px', fontSize: '20px', fontWeight: 600 }}>
        Markdown Editor Demo
      </h1>

      <div style={{ flex: 1, minHeight: 0 }}>
        <MarkdownEditor
          value={content}
          onChange={setContent}
        />
      </div>

      <details style={{ marginTop: '16px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '14px', color: '#666' }}>
          查看原始 Markdown
        </summary>
        <pre style={{
          marginTop: '8px',
          padding: '12px',
          background: '#f5f5f5',
          borderRadius: '8px',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '300px',
          overflow: 'auto',
        }}>
          {content}
        </pre>
      </details>
    </div>
  )
}
