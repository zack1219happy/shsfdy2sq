import Link from 'next/link'
import type { NavNode } from '@/lib/navigation'

interface Props {
  crumbs: NavNode[]
  baseHref?: string
}

export default function Breadcrumb({ crumbs, baseHref = '' }: Props) {
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
              <Link href={`${baseHref}/${node.pathKey}`} className="breadcrumb-link">
                {node.title}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
