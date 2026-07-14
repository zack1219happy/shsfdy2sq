'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft, faChevronRight, faBars } from '@fortawesome/free-solid-svg-icons'
import type { NavNode } from '@/lib/navigation'
import WikiFilePad from './filepad/WikiFilePad'
import ForumFilePad from './filepad/ForumFilePad'
import NoticeFilePad from './filepad/NoticeFilePad'
import UserFilePad from './filepad/UserFilePad'
import AgreementFilePad from './filepad/AgreementFilePad'
import DmFilePad from './filepad/DmFilePad'
import PlazaFilePad from './filepad/PlazaFilePad'
import WishesFilePad from './filepad/WishesFilePad'
import styles from '@/styles/filepad.module.css'

interface Props {
  tree: NavNode[]
}

const COLLAPSE_KEY = 'filepad-collapsed'

export default function FilePad({ tree }: Props) {
  const pathname = usePathname()
  const visible = pathname !== '/'

  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 判断移动端
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 从 localStorage 读取折叠状态（仅客户端）
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    setReady(true)
  }, [])

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // 路由变化时关闭抽屉
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // 抽屉打开时锁定 body 滚动
  useEffect(() => {
    if (isMobile && drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobile, drawerOpen])

  const effectiveWidth = (!visible || (ready && collapsed)) ? '0px' : '300px'

  useEffect(() => {
    document.documentElement.style.setProperty('--filepad-width', effectiveWidth)
  }, [effectiveWidth])

  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  if (!visible) return null

  // 移动端渲染
  if (isMobile) {
    return (
      <>
        {/* 汉堡菜单按钮 */}
        <button className={styles.menuBtn} onClick={toggleDrawer} title="菜单">
          <FontAwesomeIcon icon={faBars} />
        </button>

        {/* 遮罩层 */}
        <div
          className={`${styles.backdrop}${drawerOpen ? ' ' + styles.backdropVisible : ''}`}
          onClick={closeDrawer}
        />

        {/* 抽屉 */}
        <aside className={`${styles.filepad}${drawerOpen ? ' ' + styles.filepadOpen : ''}`}>
          <FilePadContent pathname={pathname} tree={tree} />
        </aside>
      </>
    )
  }

  // SSR 阶段不渲染折叠按钮（避免 hydration mismatch）
  if (!ready) {
    return (
      <aside className={styles.filepad}>
        <FilePadContent pathname={pathname} tree={tree} />
      </aside>
    )
  }

  const collapse = () => setCollapsed(true)
  const expand = () => setCollapsed(false)

  if (collapsed) {
    return (
      <button className={styles.expandBtn} onClick={expand} title="展开侧栏">
        <FontAwesomeIcon icon={faChevronRight} />
      </button>
    )
  }

  return (
    <aside className={styles.filepad}>
      <button className={styles.collapseBtn} onClick={collapse} title="折叠侧栏">
        <FontAwesomeIcon icon={faChevronLeft} />
      </button>
      <FilePadContent pathname={pathname} tree={tree} />
    </aside>
  )
}

function FilePadContent({ pathname, tree }: { pathname: string; tree: NavNode[] }) {
  const mode =
    pathname.startsWith('/wiki') ? 'wiki' :
    pathname.startsWith('/forum') ? 'forum' :
    pathname.startsWith('/notice') ? 'notice' :
    pathname.startsWith('/agreement') ? 'agreement' :
    pathname.startsWith('/user') ? 'user' :
    pathname.startsWith('/dm') ? 'dm' :
    pathname.startsWith('/plaza') ? 'plaza' :
    pathname.startsWith('/wishes') ? 'wishes' : null

  return (
    <>
      {mode === 'wiki' && <WikiFilePad tree={tree} />}
      {mode === 'forum' && <ForumFilePad />}
      {mode === 'notice' && <NoticeFilePad />}
      {mode === 'agreement' && <AgreementFilePad />}
      {mode === 'user' && <UserFilePad />}
      {mode === 'dm' && <DmFilePad />}
      {mode === 'plaza' && <PlazaFilePad />}
      {mode === 'wishes' && <WishesFilePad />}
    </>
  )
}
