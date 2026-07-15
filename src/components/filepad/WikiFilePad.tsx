'use client'

import { useState, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBook,
  faChevronRight,
  faFolder,
  faFolderOpen,
  faFileLines,
  faGavel,
} from '@fortawesome/free-solid-svg-icons'
import type { NavNode } from '@/lib/navigation'
import { resolveIcon } from '@/lib/fa-icons'
import { getSession, tryRestoreSessionFromAuth } from '@/lib/auth'
import styles from '@/styles/filepad.module.css'

interface Props {
  tree: NavNode[]
}

/** 去掉尾斜杠，用于路径比较 */
const norm = (p: string) => p.replace(/\/+$/, '') || '/'

export default function WikiFilePad({ tree }: Props) {
  const rawPathname = usePathname()
  const pathname = norm(rawPathname)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    tryRestoreSessionFromAuth().then(() => {
      const s = getSession()
      setIsAdmin(!!(s && ['admin', 'super_admin'].includes(s.role)))
    })
  }, [])

  // 自动展开当前页面的祖先文件夹 + 当前页面本身（如果是文件夹）
  useEffect(() => {
    const slug = pathname
      .replace(/^\/wiki\/?$/, 'home')
      .replace(/^\/wiki\//, '')
    if (slug === 'home' || slug.startsWith('edit')) return

    const segments = slug.split('/')
    const toExpand: string[] = []
    // 祖先文件夹
    for (let i = 1; i < segments.length; i++) {
      toExpand.push(segments.slice(0, i).join('/'))
    }
    // 当前页面本身（这样文件夹页面也会展开它的子项）
    toExpand.push(slug)

    setExpanded((prev) => {
      const next = new Set(prev)
      toExpand.forEach((k) => next.add(k))
      return next
    })
  }, [pathname])

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <>
      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faBook} className={styles.titleIcon} />
        <span className={styles.titleText}>Wiki</span>
      </div>

      <div className={styles.treeContainer}>
        {isAdmin && (
          <Link
            href="/admin/revisions"
            className={styles.treePage}
            style={{ paddingLeft: 8 }}
          >
            <span className={styles.chevronSlot} />
            <FontAwesomeIcon icon={faGavel} className={styles.treeIcon} />
            <span className={styles.treeLabel}>审核管理</span>
          </Link>
        )}

        <TreeNodes
          nodes={tree}
          depth={0}
          currentPath={pathname}
          expanded={expanded}
          onToggle={toggle}
        />
      </div>
    </>
  )
}

function TreeNodes({
  nodes,
  depth,
  currentPath,
  expanded,
  onToggle,
}: {
  nodes: NavNode[]
  depth: number
  currentPath: string
  expanded: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const slug = node.pathKey || node.id
        const href = norm(slug === 'home' ? '/wiki' : `/wiki/${slug}`)
        const isActive = currentPath === href
        const key = slug

        if (node.type === 'folder') {
          const open = expanded.has(key)
          const folderIconDef = node.icon ? resolveIcon(node.icon) : null
          return (
            <div key={key}>
              <Link
                href={href}
                className={styles.treeFolder}
                data-active={isActive || undefined}
                style={{ paddingLeft: depth * 16 + 8 }}
              >
                <span
                  className={styles.chevronSlot}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onToggle(key)
                  }}
                >
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className={styles.chevron}
                    style={{ transform: open ? 'rotate(90deg)' : undefined }}
                  />
                </span>
                {folderIconDef ? (
                  <FontAwesomeIcon icon={folderIconDef} className={styles.treeIcon} />
                ) : (
                  <FontAwesomeIcon
                    icon={open ? faFolderOpen : faFolder}
                    className={styles.treeIcon}
                  />
                )}
                <span className={styles.treeLabel}>{node.title}</span>
              </Link>
              {open && node.children && (
                <TreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  currentPath={currentPath}
                  expanded={expanded}
                  onToggle={onToggle}
                />
              )}
            </div>
          )
        }

        const iconDef = node.icon ? resolveIcon(node.icon) : null
        return (
          <Link
            key={key}
            href={href}
            className={styles.treePage}
            data-active={isActive || undefined}
            style={{ paddingLeft: depth * 16 + 8 }}
          >
            <span className={styles.chevronSlot} />
            {iconDef ? (
              <FontAwesomeIcon icon={iconDef} className={styles.treeIcon} />
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
