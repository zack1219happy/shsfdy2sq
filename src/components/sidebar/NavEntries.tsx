'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faComments,
  faBook,
  faUser,
  faBell,
  faScaleBalanced,
  faEnvelope,
  faNewspaper,
} from '@fortawesome/free-solid-svg-icons'
import { getUnreadDmCount, getUnreadCount } from '@/lib/gist-api'
import { getSession } from '@/lib/auth'
import styles from '@/styles/sidebar.module.css'

const entries = [
  { href: '/wiki', icon: faBook, label: 'Wiki' },
  { href: '/forum', icon: faComments, label: '讨论区' },
  { href: '/plaza', icon: faNewspaper, label: '广场' },
  { href: '/dm', icon: faEnvelope, label: '私信' },
  { href: '/agreement', icon: faScaleBalanced, label: '协议与帮助', mobileHidden: true },
  { href: '/notice', icon: faBell, label: '通知', mobileHidden: true },
  { href: '/user', icon: faUser, label: '用户设置' },
]

export default function HomeNav() {
  const [dmUnread, setDmUnread] = useState(0)
  const [notifUnread, setNotifUnread] = useState(0)

  useEffect(() => {
    if (!getSession()) return
    getUnreadDmCount().then(setDmUnread).catch(() => {})
    getUnreadCount().then(setNotifUnread).catch(() => {})
    const interval = setInterval(async () => {
      try { setDmUnread(await getUnreadDmCount()) } catch {}
      try { setNotifUnread(await getUnreadCount()) } catch {}
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // 监听新私信事件（Realtime 通知触发即时刷新）
  useEffect(() => {
    const h = () => {
      getSession() && getUnreadDmCount().then(setDmUnread).catch(() => {})
    }
    window.addEventListener('new-dm', h)
    return () => window.removeEventListener('new-dm', h)
  }, [])

  // 监听新通知事件
  useEffect(() => {
    const h = () => {
      getSession() && getUnreadCount().then(setNotifUnread).catch(() => {})
    }
    window.addEventListener('new-notification', h)
    return () => window.removeEventListener('new-notification', h)
  }, [])

  return (
    <>
      {entries.map((e) => (
        <Link
          key={e.href}
          href={e.href}
          className={`${styles.navItem}${e.mobileHidden ? ' ' + styles.hideOnMobile : ''}`}
        >
          <span className={styles.navIcon}>
            <FontAwesomeIcon icon={e.icon} />
            {e.href === '/dm' && dmUnread > 0 && (
              <span className={styles.navBadge}>{dmUnread > 99 ? '99+' : dmUnread}</span>
            )}
            {e.href === '/notice' && notifUnread > 0 && (
              <span className={styles.navBadge}>{notifUnread > 99 ? '99+' : notifUnread}</span>
            )}
          </span>
          <span className={styles.navLabel}>{e.label}</span>
        </Link>
      ))}
    </>
  )
}
