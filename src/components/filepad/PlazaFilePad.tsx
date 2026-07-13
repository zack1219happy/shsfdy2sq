'use client'

/**
 * PlazaFilePad — 文章广场左侧目录
 *
 * - 文件夹点击标题 → 跳转并展开
 * - 文件夹点击 chevron → 展开/折叠子项（rotate(90deg)）
 * - URL 带有 category 参数时自动展开祖先文件夹
 */

import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faNewspaper,
  faFolder,
  faFolderOpen,
  faChevronRight,
  faFileLines,
  faBookOpen,
  faRunning,
  faLightbulb,
  faPalette,
} from '@fortawesome/free-solid-svg-icons'
import { PLAZA_CATEGORIES } from '@/types/plaza'
import styles from '@/styles/filepad.module.css'

/* ==============================================================
   数据
   ============================================================== */

const categoryIcons: Record<string, typeof faBookOpen> = {
  '学习笔记': faBookOpen,
  '活动记录': faRunning,
  '经验分享': faLightbulb,
  '创作展示': faPalette,
}

interface PlazaNavNode {
  id: string
  title: string
  type: 'folder' | 'page'
  href?: string
  icon?: typeof faBookOpen
  children?: PlazaNavNode[]
}

function buildTree(): PlazaNavNode[] {
  return [
    { id: 'my', title: '我写的', type: 'page', href: '/plaza?my=1' },
    { id: 'liked', title: '我赞的', type: 'page', href: '/plaza?liked=1' },
    { id: 'new', title: '发表文章', type: 'page', href: '/plaza/new' },
    {
      id: 'articles',
      title: '文章',
      type: 'folder',
      href: '/plaza',
      children: PLAZA_CATEGORIES.map((cat): PlazaNavNode => {
        const subs = (cat.subCategories as readonly (string | null)[]).filter(
          (s): s is string => s !== null,
        )
        if (subs.length === 0) {
          return {
            id: cat.name,
            title: cat.name,
            type: 'page' as const,
            href: `/plaza?category=${encodeURIComponent(cat.name)}`,
            icon: categoryIcons[cat.name],
          }
        }
        return {
          id: cat.name,
          title: cat.name,
          type: 'folder' as const,
          href: `/plaza?category=${encodeURIComponent(cat.name)}`,
          icon: categoryIcons[cat.name],
          children: subs.map(
            (sub): PlazaNavNode => ({
              id: `${cat.name}/${sub}`,
              title: sub,
              type: 'page' as const,
              href: `/plaza?category=${encodeURIComponent(cat.name)}&sub=${encodeURIComponent(sub)}`,
            }),
          ),
        }
      }),
    },
  ]
}

/* ==============================================================
   组件
   ============================================================== */

export default function PlazaFilePad() {
  const pathname = usePathname()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // URL 带有 category 参数时自动展开祖先文件夹（仅追加，不覆盖手动折叠）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const category = params.get('category')
    if (category) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add('articles')
        next.add(category)
        return next
      })
    }
  }, [pathname])

  /** 点击文件夹标题 → 展开并跳转 */
  const handleFolderClick = useCallback((folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(folderId)
      return next
    })
  }, [])

  /** chevron 点按 → 切换展开/折叠 */
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const tree = buildTree()

  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faNewspaper} className={styles.titleIcon} />
        <span className={styles.titleText}>广场</span>
      </div>
      <div className={styles.treeContainer}>
        <TreeNodes
          nodes={tree}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onFolderClick={handleFolderClick}
        />
      </div>
    </>
  )
}

/* ==============================================================
   TreeNodes
   ============================================================== */

function TreeNodes({
  nodes,
  depth,
  expanded,
  onToggle,
  onFolderClick,
}: {
  nodes: PlazaNavNode[]
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
                  icon={open ? faFolderOpen : node.icon || faFolder}
                  className={styles.treeIcon}
                />
                <span className={styles.treeLabel}>{node.title}</span>
              </Link>
              {open && node.children && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  onFolderClick={onFolderClick}
                />
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
              <FontAwesomeIcon icon={node.icon} className={styles.treeIcon} />
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
