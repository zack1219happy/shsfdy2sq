'use client'

import { useEffect, useState, useRef } from 'react'
import { fetchAgreementPage } from '@/lib/agreement-api'
import WikiContent from '@/components/WikiContent'

interface Props {
  slug: string
  /** 静态编译时的原始 Markdown（fallback） */
  staticContent: string
  staticTitle: string
}

/**
 * Agreement 内容动态加载容器。
 *
 * - 初始渲染使用静态编译的内容（瞬间展示）
 * - 加载 DB 后如内容有更新则无缝切换
 */
export default function AgreementContentDB({ slug, staticContent, staticTitle }: Props) {
  const [dbContent, setDbContent] = useState<{ title: string; content: string } | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchAgreementPage(slug)
      .then((page) => {
        if (page && page.content !== staticContent) {
          setDbContent({ title: page.title, content: page.content })
        }
      })
      .catch(() => { /* 静默失败，保留静态内容 */ })
  }, [slug, staticContent])

  const title = dbContent?.title ?? staticTitle
  const content = dbContent?.content ?? staticContent

  return (
    <>
      <h2
        style={{
          fontSize: '1.8rem',
          fontWeight: 600,
          color: 'var(--color-text)',
          padding: '32px 0 16px',
        }}
      >
        {title}
      </h2>

      <div className="wiki-body">
        <WikiContent format="markdown" content={content} />
      </div>
    </>
  )
}
