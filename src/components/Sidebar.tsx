'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { NavNode } from '@/lib/navigation'
import FaIcon from '@/components/FaIcon'
import HomeNav from '@/components/sidebar/HomeNav'
import WikiNav from '@/components/sidebar/WikiNav'
import ForumNav from '@/components/sidebar/ForumNav'
import UserNav from '@/components/sidebar/UserNav'
import NoticeNav from '@/components/sidebar/NoticeNav'
import styles from '@/styles/sidebar.module.css'

const COLLAPSED_WIDTH = 55

interface Props {
  tree: NavNode[]
  siteTitle: string
  titleSlugMap: Record<string, string>
}

function getSidebarMode(pathname: string): 'home' | 'wiki' | 'forum' | 'user' | 'notice' {
  if (pathname === '/' || pathname === '') return 'home'
  if (pathname.startsWith('/wiki')) return 'wiki'
  if (pathname.startsWith('/forum')) return 'forum'
  if (pathname.startsWith('/user')) return 'user'
  if (pathname.startsWith('/notice')) return 'notice'
  return 'wiki' // default
}

export default function Sidebar({ tree, siteTitle }: Props) {
  const pathname = usePathname()
  const mode = getSidebarMode(pathname)

  const [collapsed, setCollapsed] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)

  // 从 localStorage 恢复折叠、宽度和展开状态
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

  // 同步 --sidebar-actual-width 到 <html>
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

  return (
    <>
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
              <FaIcon name="bars" />
            </button>
          ) : (
            <>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit' }}>
                <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/logo.png`} alt="" className={styles.siteIcon} />
                <h1>{siteTitle}</h1>
              </Link>
              <button
                className={styles.toggleBtn}
                onClick={() => setCollapsed(true)}
                aria-label="收起侧边栏"
              >
                <FaIcon name="chevron-left" />
              </button>
            </>
          )}
        </div>

        {mode === 'home' && <HomeNav collapsed={collapsed} />}
        {mode === 'wiki' && (
          <WikiNav
            tree={tree}
            collapsed={collapsed}
            expandedFolders={expandedFolders}
            onToggleFolder={toggleFolder}
          />
        )}
        {mode === 'forum' && <ForumNav collapsed={collapsed} />}
        {mode === 'user' && <UserNav collapsed={collapsed} />}
        {mode === 'notice' && <NoticeNav collapsed={collapsed} />}
      </div>

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
