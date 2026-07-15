'use client'

import { useEffect, useState, useRef } from 'react'
import { fetchWikiPage } from '@/lib/wiki-api'
import WikiContent from '@/components/WikiContent'

interface Props {
  slug: string
  /** 静态编译时的原始 Markdown（fallback） */
  staticContent: string
}

/**
 * 动态 wiki 内容容器。
 *
 * - 初始渲染使用静态编译的内容（SSR 瞬间展示）
 * - 加载 DB 后如有更新版本则无缝切换
 *
 * 这样审批通过后的内容能立即展示，无需重新构建。
 */
export default function WikiContentDB({ slug, staticContent }: Props) {
  const [dbContent, setDbContent] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetchWikiPage(slug)
      .then((page) => {
        if (page && page.content !== staticContent) {
          setDbContent(page.content)
        }
      })
      .catch(() => {})
  }, [slug, staticContent])

  return <WikiContent content={dbContent ?? staticContent} className="wiki-body" slug={slug} />
}
