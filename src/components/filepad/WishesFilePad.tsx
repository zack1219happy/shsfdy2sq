'use client'

/**
 * WishesFilePad — 许愿池左侧导航
 * 结构对齐 PlazaFilePad：固定 action 项 + "需求" folder（内容分类）
 * folder 节点 href 指向全部，子节点是 tier 筛选
 */

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCoins,
  faPlus,
  faFolder,
  faFolderOpen,
  faChevronRight,
  faFileLines,
  faStar,
  faCube,
  faGem,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'
import styles from '@/styles/filepad.module.css'

interface NavNode {
  id: string
  title: string
  type: 'folder' | 'page'
  href?: string
  icon?: IconDefinition
  iconColor?: string
  children?: NavNode[]
}

const tierIcons: Record<string, { icon: IconDefinition; color: string }> = {
  small:   { icon: faStar, color: '#2ecc40' },
  medium:  { icon: faCube, color: '#f39c12' },
  large:   { icon: faGem,  color: '#e74c3c' },
}

function buildNavTree(): NavNode[] {
  return [
    // —— 固定 action ——
    {
      id: 'new', title: '提交需求', type: 'page',
      href: '/wishes/new', icon: faPlus,
    },
    // —— 内容分类 folder（href=全部，子节点=筛选） ——
    {
      id: 'all', title: '需求', type: 'folder',
      href: '/wishes', icon: undefined,
      children: [
        { id: 'small',  title: '小功能',   type: 'page', href: '/wishes?tier=small',  icon: tierIcons.small.icon,  iconColor: tierIcons.small.color },
        { id: 'medium', title: '中级开发', type: 'page', href: '/wishes?tier=medium', icon: tierIcons.medium.icon, iconColor: tierIcons.medium.color },
        { id: 'large',  title: '大型开发', type: 'page', href: '/wishes?tier=large',  icon: tierIcons.large.icon,  iconColor: tierIcons.large.color },
      ],
    },
  ]
}

export default function WishesFilePad() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['all']))

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const handleFolderClick = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(folderId)
      return next
    })
  }, [])

  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faCoins} className={styles.titleIcon} />
        <span className={styles.titleText}>许愿池</span>
      </div>
      <div className={styles.treeContainer}>
        <TreeNodes
          nodes={buildNavTree()}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onFolderClick={handleFolderClick}
        />
      </div>
    </>
  )
}

function TreeNodes({
  nodes, depth, expanded, onToggle, onFolderClick,
}: {
  nodes: NavNode[]
  depth: number
  expanded: Set<string>
  onToggle: (key: string) => void
  onFolderClick: (key: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const open = expanded.has(node.id)

        if (node.type === 'folder') {
          return (
            <div key={node.id}>
              <Link
                href={node.href || '#'}
                className={styles.treeFolder}
                style={{ paddingLeft: depth * 16 + 8 }}
                onClick={() => onFolderClick(node.id)}
              >
                <span
                  className={styles.chevronSlot}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onToggle(node.id)
                  }}
                >
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className={styles.chevron}
                    style={{ transform: open ? 'rotate(90deg)' : undefined }}
                  />
                </span>
                <FontAwesomeIcon
                  icon={open ? faFolderOpen : faFolder}
                  className={styles.treeIcon}
                />
                <span className={styles.treeLabel}>{node.title}</span>
              </Link>
              {open && node.children && (
                <TreeNodes nodes={node.children} depth={depth + 1} expanded={expanded} onToggle={onToggle} onFolderClick={onFolderClick} />
              )}
            </div>
          )
        }

        return (
          <Link
            key={node.id}
            href={node.href || '#'}
            className={styles.treePage}
            style={{ paddingLeft: depth * 16 + 8 }}
          >
            <span className={styles.chevronSlot} />
            {node.icon ? (
              <FontAwesomeIcon icon={node.icon} className={styles.treeIcon} style={node.iconColor ? { color: node.iconColor } : undefined} />
            ) : (
              <FontAwesomeIcon icon={faFileLines} className={styles.treeIcon} />
            )}
            <span className={styles.treeLabel}>{node.title}</span>
          </Link>
        )
      })}
    </>
  )
}
