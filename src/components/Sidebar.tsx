'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { NavNode } from '@/lib/navigation'
import WikiContent from '@/components/WikiContent'
import styles from '@/styles/sidebar.module.css'

const COLLAPSED_WIDTH = 55

interface Props {
  tree: NavNode[]
  siteTitle: string
}

function getActivePathKey(pathname: string): string {
  const slug = pathname.replace(/^\//, '').replace(/\/$/, '')
  return slug || 'home'
}

export default function Sidebar({ tree, siteTitle }: Props) {
  const pathname = usePathname()
  const activePathKey = getActivePathKey(pathname)

  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)

  // 从 localStorage 恢复折叠、宽度和展开状态（hydration 后运行，避免 SSR 不匹配）
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved === 'true') setCollapsed(true)
    const savedWidth = localStorage.getItem('sidebarWidth')
    if (savedWidth) {
      const w = parseInt(savedWidth, 10)
      if (!isNaN(w) && w >= 180 && w <= 400) setSidebarWidth(w)
    }
    const folderStates = localStorage.getItem('folderStates')
    if (folderStates) {
      try {
        const parsed = JSON.parse(folderStates)
        setExpandedFolders(new Set(Object.entries(parsed).filter(([, v]) => v).map(([k]) => k)))
      } catch { /* ignore parse error */ }
    }
  }, [])

  // 持久化折叠状态
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed))
  }, [collapsed])

  // 持久化宽度
  useEffect(() => {
    if (!collapsed) {
      localStorage.setItem('sidebarWidth', String(sidebarWidth))
    }
  }, [sidebarWidth, collapsed])

  // 同步 --sidebar-actual-width 到 <html>，让 layout 的 margin-left 跟随
  useEffect(() => {
    const actual = collapsed ? COLLAPSED_WIDTH : sidebarWidth
    document.documentElement.style.setProperty('--sidebar-actual-width', `${actual}px`)
  }, [sidebarWidth, collapsed])

  // 拖拽缩放
  const startResize = useCallback((e: React.MouseEvent) => {
    resizingRef.current = true
    document.body.classList.add('resizing')

    const startX = e.clientX
    const startWidth = sidebarRef.current?.offsetWidth || sidebarWidth

    const doResize = (e: MouseEvent) => {
      if (!resizingRef.current) return
      setCollapsed(false)
      const newWidth = Math.min(400, Math.max(180, startWidth + e.clientX - startX))
      setSidebarWidth(newWidth)
    }

    const stopResize = () => {
      resizingRef.current = false
      document.body.classList.remove('resizing')
      window.removeEventListener('mousemove', doResize)
      window.removeEventListener('mouseup', stopResize)
    }

    window.addEventListener('mousemove', doResize)
    window.addEventListener('mouseup', stopResize)
  }, [sidebarWidth])

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      localStorage.setItem('folderStates', JSON.stringify(
        Object.fromEntries([...next].map((k) => [k, true]))
      ))
      return next
    })
  }, [])

  const renderNode = (node: NavNode, level: number) => {
    const isFolder = node.type === 'folder' && !!node.children?.length
    const isExpanded = expandedFolders.has(node.id)
    const isActive = node.pathKey === activePathKey

    return (
      <li key={node.pathKey} className={styles.treeNode}>
        <div
          className={`${styles.nodeContent} ${isActive ? styles.active : ''}`}
          style={{ paddingLeft: `${8 + (collapsed ? 0 : level * 12)}px` }}
          onClick={() => {
            if (isFolder) toggleFolder(node.id)
            if (node.hasContent) {
              router.push(node.pathKey === 'home' ? '/' : `/${node.pathKey}`)
            }
          }}
        >
          {!collapsed && isFolder && node.children ? (
            <span className={styles.expandIcon}>
              <i className={`fas fa-chevron-right ${isExpanded ? styles.rotated : ''}`} />
            </span>
          ) : (
            !collapsed && <span className={styles.spacer} />
          )}

          <i className={`${styles.treeIcon} ${node.icon || (isFolder ? (isExpanded ? 'fas fa-folder-open' : 'fas fa-folder') : 'fas fa-file-lines')}`}
            title={collapsed ? node.title : undefined}
          />

          {!collapsed && (
            node.hasContent ? (
              <Link
                href={node.pathKey === 'home' ? '/' : `/${node.pathKey}`}
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
          <ul
            id={`children-${node.id}`}
            className={`${styles.treeChildren} ${isExpanded ? styles.treeChildrenExpanded : ''}`}
          >
            {node.children.map((child) => renderNode(child, level + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <>
      {/* 侧边栏 */}
      <div
        ref={sidebarRef}
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
        style={{ width: collapsed ? `${COLLAPSED_WIDTH}px` : `${sidebarWidth}px` }}
      >
        <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`}>
          {collapsed ? (
            <button
              className={styles.toggleBtn}
              onClick={() => setCollapsed(false)}
              aria-label="展开侧边栏"
            >
              <i className="fas fa-bars" />
            </button>
          ) : (
            <>
              <h1>{siteTitle}</h1>
              <button
                className={styles.toggleBtn}
                onClick={() => setCollapsed(true)}
                aria-label="收起侧边栏"
              >
                <i className="fas fa-chevron-left" />
              </button>
            </>
          )}
        </div>

        <ul className={`${styles.tree} ${collapsed ? styles.treeCollapsed : ''}`}>
          {tree.map((node) => renderNode(node, 0))}
        </ul>

        {!collapsed && <Announcement />}
      </div>

      {/* 拖拽手柄 */}
      {!collapsed && (
        <div
          className={styles.resizeHandle}
          style={{ left: `${sidebarWidth}px` }}
          onMouseDown={startResize}
        />
      )}
    </>
  )
}

function Announcement() {
  const [markdown, setMarkdown] = useState<string>('')

  const loadAnnouncement = useCallback(async () => {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const resp = await fetch(`${base}/data/announcement.md?t=${Date.now()}`, { cache: 'no-store' })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      setMarkdown(await resp.text())
    } catch {
      setMarkdown('⚠️ 公告加载失败')
    }
  }, [])

  useEffect(() => {
    loadAnnouncement()
  }, [loadAnnouncement])

  return (
    <div className={styles.announcement}>
      <div className={styles.announcementHeader}>
        <i className="fas fa-bullhorn" />
        <span>公告</span>
        <button
          className={styles.announcementRefresh}
          onClick={loadAnnouncement}
          title="刷新"
        >
          <i className="fas fa-sync-alt" />
        </button>
      </div>
      {markdown ? (
        <WikiContent format="markdown" content={markdown} className={styles.announcementContent} />
      ) : (
        <div className={styles.announcementContent}>
          <i className="fas fa-spinner fa-pulse" /> 加载中...
        </div>
      )}
    </div>
  )
}
