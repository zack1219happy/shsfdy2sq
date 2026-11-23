'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { BASE_PATH } from '@/lib/constants'

export default function NotFound() {
  useEffect(() => {
    // 仅在 GitHub Pages 上且当前路径漏了 basePath 时自动跳转
    if (
      typeof window !== 'undefined' &&
      BASE_PATH &&
      window.location.hostname.includes('github.io') &&
      !window.location.pathname.startsWith(BASE_PATH)
    ) {
      // 把 /home -> / 映射掉，因为首页实际在 / 不在 /home/
      const normalized = window.location.pathname.replace(/^\/home(?=\/|$)/i, '')
      window.location.replace(`${BASE_PATH}${normalized}${window.location.search}${window.location.hash}`)
    }
  }, [])

  return (
    <div className="not-found-page page-content">
      <h2>404</h2>
      <p>页面不存在</p>
      {/* Link 会自动补 basePath，这里不能再手工拼 BASE_PATH，否则 GitHub Pages 上会变成 /shsfdy2sq/shsfdy2sq/... */}
      <Link href="/wiki/">返回 wiki</Link>
      <Link href="/" style={{ marginLeft: 16 }}>返回首页</Link>
    </div>
  )
}
