'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Dispatch, SetStateAction } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBook,
  faChevronRight,
  faFolder,
  faFolderOpen,
  faFileLines,
  faGavel,
  faPlus,
} from '@fortawesome/free-solid-svg-icons'
import type { NavNode } from '@/lib/navigation'
import { resolveIcon } from '@/lib/fa-icons'
import { getSession, tryRestoreSessionFromAuth } from '@/lib/auth'
import { fetchAllWikiPages } from '@/lib/wiki-api'
import { resolveText } from '@/lib/people'
import { registry as personRegistry } from '@/data/person-registry'
import styles from '@/styles/filepad.module.css'

interface Props {
  tree?: NavNode[]
}

/** 去掉尾斜杠，用于路径比较 */
const norm = (p: string) => p.replace(/\/+$/, '') || '/'

/** 从 Supabase 返回的页面列表构建导航树（客户端版） */
function buildNavTree(pages: { slug: string; title: string; frontmatter: Record<string, unknown> }[]): NavNode[] {
  const rootMap = new Map<string, NavNode>()
  const childrenMap = new Map<string, NavNode[]>()

  // 处理所有页面
  for (const p of pages) {
    const segments = p.slug.split('/')
    const icon = (p.frontmatter?.icon as string) || undefined
    const node: NavNode = {
      id: segments[segments.length - 1],
      title: resolveText(p.title, personRegistry),
      type: 'page',
      icon,
      hasContent: true,
      pathKey: p.slug,
    }
    const parentKey = segments.slice(0, -1).join('/')
    const list = childrenMap.get(parentKey) || []
    list.push(node)
    childrenMap.set(parentKey, list)
    rootMap.set(p.slug, node)
  }

  // 创建中间文件夹节点
  for (const p of pages) {
    const segments = p.slug.split('/')
    for (let i = 1; i < segments.length; i++) {
      const folderId = segments.slice(0, i).join('/')
      if (rootMap.has(folderId)) continue
      const name = segments[i - 1]
      const parentKey = segments.slice(0, i - 1).join('/')
      const folderNode: NavNode = {
        id: name,
        title: name,
        type: 'folder',
        pathKey: folderId,
      }
      rootMap.set(folderId, folderNode)
      const list = childrenMap.get(parentKey) || []
      if (!list.some((n) => n.id === name)) {
        list.push(folderNode)
        childrenMap.set(parentKey, list)
      }
    }
  }

  // 挂载 children
  for (const [key, node] of rootMap) {
    const kids = childrenMap.get(node.pathKey ?? '') || []
    if (kids.length > 0) {
      node.children = kids
      if (node.type === 'page') node.type = 'folder'
    }
  }

  // 排序
  const rootList = childrenMap.get('') || []
  for (const [, list] of childrenMap) {
    list.sort((a, b) => {
      if (a.id === 'home') return -1
      if (b.id === 'home') return 1
      return a.id.localeCompare(b.id)
    })
  }
  rootList.sort((a, b) => {
    if (a.id === 'home') return -1
    if (b.id === 'home') return 1
    return a.id.localeCompare(b.id)
  })

  return rootList
}

export default function WikiFilePad(_props: Props) {
  const rawPathname = usePathname()
  const pathname = norm(rawPathname)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pages, setPages] = useState<{ slug: string; title: string; frontmatter: Record<string, unknown> }[] | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    tryRestoreSessionFromAuth().then(() => {
      const s = getSession()
      setIsAdmin(!!(s && ['admin', 'super_admin'].includes(s.role)))
    })
  }, [])

  // 客户端拉取所有 wiki 页面构建导航树（实时同步 DB 的最新状态）
  useEffect(() => {
    fetchAllWikiPages()
      .then((all) => setPages(all.map((p) => ({ slug: p.slug, title: p.title, frontmatter: p.frontmatter ?? {} }))))
      .catch(() => setPages([]))
  }, [])

  // 构建导航树
  const tree = useMemo(() => {
    if (!pages) return [] as NavNode[]
    return buildNavTree(pages)
  }, [pages])

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
      <Suspense fallback={null}>
        <AutoExpandWatcher setExpanded={setExpanded} />
      </Suspense>

      <div className={styles.titleRow}>
        <FontAwesomeIcon icon={faBook} className={styles.titleIcon} />
        <span className={styles.titleText}>Wiki</span>
        <Link
          href="/wiki/create"
          className={styles.createBtn}
          title="新建页面"
        >
          <FontAwesomeIcon icon={faPlus} />
        </Link>
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
        const href = slug === 'home' ? '/wiki' : `/wiki/page?slug=${slug}`
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

/**
 * 监听 URL slug 参数变化，自动展开当前页面和其父文件夹。
 * 使用 useSearchParams 所以必须放在 <Suspense> 内。
 */
function AutoExpandWatcher({
  setExpanded,
}: {
  setExpanded: Dispatch<SetStateAction<Set<string>>>
}) {
  const pathname = norm(usePathname())
  const searchParams = useSearchParams()

  useEffect(() => {
    let slug = ''
    if (pathname.startsWith('/wiki/page')) {
      slug = searchParams.get('slug') || ''
    } else if (pathname.startsWith('/wiki/')) {
      slug = pathname.replace(/^\/wiki\//, '')
      if (slug === 'wiki' || slug === 'page') slug = 'home'
    }
    if (!slug || slug === 'home' || slug.startsWith('edit')) return

    const segments = slug.split('/')
    const toExpand: string[] = []
    for (let i = 1; i < segments.length; i++) {
      toExpand.push(segments.slice(0, i).join('/'))
    }
    toExpand.push(slug)

    setExpanded((prev) => {
      const next = new Set(prev)
      toExpand.forEach((k) => next.add(k))
      return next
    })
  }, [pathname, searchParams, setExpanded])

  return null
}
