'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
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

/** 空订阅：仅用于 SSR/hydration 阶段区分客户端挂载状态 */
const emptySubscribe = () => () => {}

export default function FilePad({}: Props) {
  const pathname = usePathname()
  const visible = pathname !== '/'

  // 折叠状态仅客户端读取 localStorage，SSR 阶段保持 false 以避免 hydration mismatch
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(COLLAPSE_KEY) === '1' : false,
  )
  // SSR/hydration 阶段返回 false（渲染完整侧栏），挂载后返回 true
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 响应式移动端判断（订阅媒体查询，服务端快照为 false）
  const subscribeMobile = useCallback((onChange: () => void) => {
    const mq = window.matchMedia('(max-width: 768px)')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia('(max-width: 768px)').matches,
    () => false,
  )

  // 持久化折叠状态
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // 路由变化时关闭抽屉（渲染期调整，替代 effect 内 setState）
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setDrawerOpen(false)
  }

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
          <FilePadContent pathname={pathname} />
        </aside>
      </>
    )
  }

  // SSR 阶段不渲染折叠按钮（避免 hydration mismatch）
  if (!ready) {
    return (
      <aside className={styles.filepad}>
        <FilePadContent pathname={pathname} />
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
      <FilePadContent pathname={pathname} />
    </aside>
  )
}

function FilePadContent({ pathname }: { pathname: string }) {
  const mode =
    pathname.startsWith('/wiki') || pathname.startsWith('/admin') ? 'wiki' :
    pathname.startsWith('/forum') ? 'forum' :
    pathname.startsWith('/notice') ? 'notice' :
    pathname.startsWith('/agreement') ? 'agreement' :
    pathname.startsWith('/user') ? 'user' :
    pathname.startsWith('/dm') ? 'dm' :
    pathname.startsWith('/plaza') ? 'plaza' :
    pathname.startsWith('/wishes') ? 'wishes' : null

  return (
    <>
      {mode === 'wiki' && <WikiFilePad />}
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
