import Link from 'next/link'
import type { NavNode } from '@/lib/navigation'

interface Props {
  crumbs: NavNode[]
}

export default function Breadcrumb({ crumbs }: Props) {
  if (crumbs.length === 0) return null

  return (
    <nav className="breadcrumb">
      {crumbs.map((node, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={node.pathKey}>
            {i > 0 && <span className="breadcrumb-sep"> / </span>}
            {isLast ? (
              <span className="breadcrumb-current">{node.title}</span>
            ) : (
              <Link href={`/${node.pathKey}`} className="breadcrumb-link">
                {node.title}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
