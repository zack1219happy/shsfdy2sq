'use client'

import { useEffect } from 'react'
import Link from 'next/link'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function NotFound() {
  useEffect(() => {
    // 仅在 GitHub Pages 上且当前路径漏了 basePath 时自动跳转
    if (
      typeof window !== 'undefined' &&
      BASE_PATH &&
      window.location.hostname.includes('github.io') &&
      !window.location.pathname.startsWith(BASE_PATH)
    ) {
      window.location.href = `${BASE_PATH}${window.location.pathname}${window.location.search}${window.location.hash}`
    }
  }, [])

  return (
    <div className="not-found-page page-content">
      <h2>404</h2>
      <p>页面不存在</p>
      <Link href={`${BASE_PATH}/`}>返回首页</Link>
    </div>
  )
}
