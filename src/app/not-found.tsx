import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="not-found-page page-content">
      <h2>404</h2>
      <p>页面不存在</p>
      <Link href="/">返回首页</Link>
    </div>
  )
}
