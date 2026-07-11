'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import type { NavNode } from '@/lib/navigation'
import FaIcon from '@/components/FaIcon'
import styles from '@/styles/sidebar.module.css'

function getWikiActiveKey(pathname: string): string {
  // /wiki/campus/map → campus/map; /wiki/ → home
  const wikiPath = pathname.replace(/^\/wiki/, '').replace(/^\//, '').replace(/\/$/, '')
  return wikiPath || 'home'
}

interface Props {
  tree: NavNode[]
  collapsed: boolean
  expandedFolders: Set<string>
  onToggleFolder: (id: string) => void
}

export default function WikiNav({ tree, collapsed, expandedFolders, onToggleFolder }: Props) {
  const pathname = usePathname()
  const activePathKey = getWikiActiveKey(pathname)
  const router = useRouter()

  const renderNode = useCallback((node: NavNode, level: number): React.ReactNode => {
    const isFolder = node.type === 'folder' && !!node.children?.length
    const isExpanded = expandedFolders.has(node.id)
    const isActive = node.pathKey === activePathKey

    return (
      <div key={node.pathKey} className={styles.treeNode}>
        <div
          className={`${styles.nodeContent} ${isActive ? styles.active : ''}`}
          style={{ paddingLeft: `${8 + (collapsed ? 0 : level * 12)}px` }}
          onClick={() => {
            if (isFolder) onToggleFolder(node.id)
            if (node.hasContent) {
              router.push(node.pathKey === 'home' ? '/wiki/' : `/wiki/${node.pathKey}`)
            }
          }}
        >
          {!collapsed && isFolder && node.children ? (
            <span className={`${styles.expandIcon} ${isExpanded ? styles.rotated : ''}`}>
              <FaIcon name="chevron-right" />
            </span>
          ) : (
            !collapsed && <span className={styles.spacer}>-</span>
          )}

          <FaIcon
            name={node.icon || (isFolder ? (isExpanded ? 'folder-open' : 'folder') : 'file-lines')}
            className={styles.treeIcon}
            title={collapsed ? node.title : undefined}
          />

          {!collapsed && (
            node.hasContent ? (
              <Link
                href={node.pathKey === 'home' ? '/wiki/' : `/wiki/${node.pathKey}`}
                className={styles.treeTitle}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {node.title}
              </Link>
            ) : (
              <span className={styles.treeTitle}>{node.title}</span>
            )
          )}
        </div>

        {!collapsed && isFolder && node.children && (
          <div
            id={`children-${node.id}`}
            className={`${styles.treeChildren} ${isExpanded ? styles.treeChildrenExpanded : ''}`}
          >
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }, [collapsed, activePathKey, expandedFolders, onToggleFolder, router])

  return (
    <div className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
      {tree.map((node) => renderNode(node, 0))}
    </div>
  )
}
