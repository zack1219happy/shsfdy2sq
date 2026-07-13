'use client'

/**
 * PlazaFilePad — 文章广场左侧目录
 *
 * - 分类数据从数据库动态加载（不再硬编码 PLAZA_CATEGORIES）
 * - 文件夹点击标题 → 跳转并展开
 * - 文件夹点击 chevron → 展开/折叠子项（rotate(90deg)）
 * - URL 带有 category 参数时自动展开祖先文件夹
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faNewspaper,
  faFolder,
  faFolderOpen,
  faChevronRight,
  faFileLines,
  faBook,
  faBookOpen,
  faRunning,
  faLightbulb,
  faPalette,
  faPen,
  faStar,
  faPlus,
} from '@fortawesome/free-solid-svg-icons'
import { fetchPlazaCategories } from '@/lib/gist-api'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'
import type { PlazaCategory, PlazaCategoryTreeNode } from '@/types/plaza'
import { buildCategoryTree } from '@/types/plaza'
import styles from '@/styles/filepad.module.css'

/* ==============================================================
   图标映射
   ============================================================== */

const categoryIcons: Record<string, IconDefinition> = {
  '学习笔记': faBookOpen,
  '活动记录': faRunning,
  '经验分享': faLightbulb,
  '创作展示': faPalette,
  '小说': faBook,
}

interface PlazaNavNode {
  id: string
  title: string
  type: 'folder' | 'page'
  href?: string
  icon?: IconDefinition
  children?: PlazaNavNode[]
}

function buildNavTree(categories: PlazaCategory[]): PlazaNavNode[] {
  const tree = buildCategoryTree(categories)

  // 固定项（我写的 / 我赞的 / 发表文章）
  const fixed: PlazaNavNode[] = [
    { id: 'my', title: '我写的', type: 'page', href: '/plaza?my=1', icon: faPen },
    { id: 'liked', title: '我赞的', type: 'page', href: '/plaza?liked=1', icon: faStar },
    { id: 'new', title: '发表文章', type: 'page', href: '/plaza/new', icon: faPlus },
  ]

  // 将分类树转为导航节点
  function convertTree(nodes: PlazaCategoryTreeNode[]): PlazaNavNode[] {
    return nodes.map((cat): PlazaNavNode => {
      if (cat.children.length === 0) {
        // 叶子 → 页面
        return {
          id: cat.id,
          title: cat.name,
          type: 'page',
          href: `/plaza?category=${encodeURIComponent(cat.name)}`,
          icon: categoryIcons[cat.name],
        }
      }
      return {
        id: cat.id,
        title: cat.name,
        type: 'folder',
        href: `/plaza?category=${encodeURIComponent(cat.name)}`,
        icon: categoryIcons[cat.name],
        children: convertTree(cat.children),
      }
    })
  }

  return [
    ...fixed,
    {
      id: 'articles',
      title: '文章',
      type: 'folder',
      href: '/plaza',
      children: convertTree(tree),
    },
  ]
}

/* ==============================================================
   组件
   ============================================================== */

export default function PlazaFilePad() {
  const pathname = usePathname()

  const [categories, setCategories] = useState<PlazaCategory[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 加载分类
  useEffect(() => {
    fetchPlazaCategories()
      .then(setCategories)
      .catch(() => {})
  }, [])

  // URL 带有 category 参数时自动展开祖先文件夹（仅追加，不覆盖手动折叠）
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const category = params.get('category')
    if (category) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add('articles')
        // 找到该分类的节点 ID
        const cat = categories.find((c) => c.name === category)
        if (cat) {
          // 展开到该分类的父级
          let parentId = cat.parent_id
          while (parentId) {
            next.add(parentId)
            const parent = categories.find((c) => c.id === parentId)
            parentId = parent?.parent_id || null
          }
          if (cat.parent_id) {
            // 如果是子分类，展开父级
            next.add(cat.parent_id)
          }
        }
        next.add('articles')
        return next
      })
    }
  }, [pathname, categories])

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

  const tree = useMemo(() => buildNavTree(categories), [categories])

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
