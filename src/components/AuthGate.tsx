'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getSession,
  login,
  clearSession,
  tryRestoreSessionFromAuth,
  type UserSession,
} from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getUnreadCount, getUnreadDmCount } from '@/lib/gist-api'
import styles from '@/styles/auth.module.css'
import FaIcon from '@/components/FaIcon'
import { UserColorProvider } from '@/lib/user-colors'
import { BASE_PATH } from '@/lib/constants'
import { UserName } from '@/components/UserName'
import {
  useBrowserNotifications,
  requestNotificationPermission,
} from '@/lib/useBrowserNotifications'

/* ==============================================================
   AuthGate — 页面级登录门

   包裹整个 wiki 内容区域：
   - 未登录 → 全屏登录界面
   - 已登录 → 渲染 children + 右上角通知铃铛 + 用户入口
   ============================================================== */

interface Props {
  children: React.ReactNode
}

export default function AuthGate({ children }: Props) {
  const [session, setSession] = useState<UserSession | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setSession(getSession())
    setChecked(true)
    tryRestoreSessionFromAuth().then(() => setSession(getSession()))
  }, [])

  // 定期检查封禁状态（30 秒一次），封禁中则自动退登
  useEffect(() => {
    const interval = setInterval(async () => {
      const s = getSession()
      if (!s) return
      const { data } = await supabase.rpc('check_ban', { p_user_id: s.userId })
      const banned = (data as any) ?? (Array.isArray(data) ? data[0] : null)
      if (banned) {
        clearSession()
        setSession(null)
        window.dispatchEvent(new CustomEvent('user-session-changed'))
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = () => setSession(getSession())
    window.addEventListener('user-session-changed', handler)
    return () => window.removeEventListener('user-session-changed', handler)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setSession((prev) => {
        const s = getSession()
        if (prev?.userId !== s?.userId || prev?.username !== s?.username) {
          return s
        }
        return prev
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleLoginSuccess = useCallback((s: UserSession) => {
    setSession(s)
    window.dispatchEvent(new CustomEvent('user-session-changed'))
  }, [])

  const handleLogout = useCallback(() => {
    clearSession()
    setSession(null)
    window.dispatchEvent(new CustomEvent('user-session-changed'))
  }, [])

  // Realtime 订阅 + 浏览器通知（必须在条件 return 之前调用，保障 hooks 顺序）
  useBrowserNotifications(session?.userId ?? null)

  if (!checked) return null
  if (!session) return <LoginScreen onSuccess={handleLoginSuccess} />

  return (
    <UserColorProvider>
      <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 1500, display: 'flex', gap: 6 }}>
        <DmBadge />
        <NotificationBadge />
        <UserBtn session={session} onLogout={handleLogout} />
      </div>
      {children}
    </UserColorProvider>
  )
}

/* ==============================================================
   LoginScreen — 全屏登录界面
   ============================================================== */

function LoginScreen({
  onSuccess,
}: {
  onSuccess: (session: UserSession) => void
}) {
  const [name, setName] = useState('')
  const [credential, setCredential] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [bannedUntil, setBannedUntil] = useState<string | null>(null)
  const [banDismissed, setBanDismissed] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setMessage(null)
      setBanDismissed(false)

      if (!name.trim()) {
        setMessage({ type: 'error', text: '请输入姓名' })
        return
      }
      if (!credential.trim()) {
        setMessage({ type: 'error', text: '请输入密码或学号' })
        return
      }

      setLoading(true)
      const result = await login(name.trim(), credential.trim())
      setLoading(false)

      if (result.success) {
        const s = getSession()
        if (s) onSuccess(s)
      } else {
        if (result.bannedUntil) {
          setBannedUntil(result.bannedUntil)
        } else {
          setMessage({ type: 'error', text: result.message })
        }
      }
    },
    [name, credential, onSuccess],
  )

  const untilStr = bannedUntil
    ? new Date(bannedUntil).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : ''

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <img src={`${BASE_PATH}/logo.webp`} alt="" className={styles.cardLogo} />

        <h1>上中二旦社区</h1>
        <p className={styles.cardSubtitle}>上海中学二旦班 · 班级知识库</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="auth-name">姓名 / 用户名</label>
            <input
              id="auth-name"
              type="text"
              placeholder="真实姓名或用户名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={20}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="auth-cred">密码 / 学号</label>
            <input
              id="auth-cred"
              type="password"
              placeholder="未设密码则填 8 位学号，已设密码则填密码"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
            />
          </div>

          {message && (
            <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`}>
              {message.text}
            </div>
          )}

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? '登录中…' : '登 录'}
          </button>
        </form>

        <p className={styles.pwdNotice}>
          如果你在 2026/7/9 及以前修改过密码，密码可能已被重置为 8 位学号
        </p>
      </div>

      {/* 封禁弹窗 */}
      {bannedUntil && !banDismissed && (
        <div className={styles.banOverlay}>
          <div className={styles.banModal}>
            <div className={styles.banIcon}>🚫</div>
            <h2 className={styles.banTitle}>账号已被封禁</h2>
            <p className={styles.banBody}>
              您因恶意盗号被封禁 3 天
            </p>
            <p className={styles.banExpiry}>
              至 {untilStr} 解禁
            </p>
            <p className={styles.banWarning}>下不为例</p>
            <button
              className={styles.banDismissBtn}
              onClick={() => setBanDismissed(true)}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   DmBadge — 右上角私信入口（独立于通知系统）
   ============================================================== */

function DmBadge() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (s) {
      getUnreadDmCount().then(setUnread).catch(() => {})
    }
    setSessionChecked(true)
  }, [])

  // 15 秒轮询未读数
  useEffect(() => {
    if (!sessionChecked) return
    const s = getSession()
    if (!s) return
    const interval = setInterval(async () => {
      try { setUnread(await getUnreadDmCount()) } catch { /* ignore */ }
    }, 15000)
    return () => clearInterval(interval)
  }, [sessionChecked])

  // 新私信事件触发即时刷新
  useEffect(() => {
    const h = () => {
      getSession() && getUnreadDmCount().then(setUnread).catch(() => {})
    }
    window.addEventListener('new-dm', h)
    return () => window.removeEventListener('new-dm', h)
  }, [])

  return (
    <button className={styles.bellBtn} onClick={() => router.push('/dm')} title="私信">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      {unread > 0 && <span className={styles.bellBadge}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}

/* ==============================================================
   NotificationBadge — 通知铃铛（点击跳转，无下拉面板）
   ============================================================== */

function NotificationBadge() {
  const router = useRouter()
  const [unread, setUnread] = useState(0)
  const [sessionChecked, setSessionChecked] = useState(false)

  useEffect(() => {
    const s = getSession()
    if (s) {
      getUnreadCount().then(setUnread).catch(() => {})
    }
    setSessionChecked(true)
  }, [])

  // 15 秒轮询未读数
  useEffect(() => {
    if (!sessionChecked) return
    const s = getSession()
    if (!s) return
    const interval = setInterval(async () => {
      try { setUnread(await getUnreadCount()) } catch { /* ignore */ }
    }, 15000)
    return () => clearInterval(interval)
  }, [sessionChecked])

  // 新通知事件触发即时刷新
  useEffect(() => {
    const h = () => {
      getSession() && getUnreadCount().then(setUnread).catch(() => {})
    }
    window.addEventListener('new-notification', h)
    return () => window.removeEventListener('new-notification', h)
  }, [])

  return (
    <button className={styles.bellBtn} onClick={() => { requestNotificationPermission(); router.push('/notice') }} title="通知">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && <span className={styles.bellBadge}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}

/* ==============================================================
   UserBtn — 右上角用户入口（点击跳转到 /user）
   ============================================================== */

function UserBtn({ session, onLogout }: { session: UserSession; onLogout: () => void }) {
  const router = useRouter()

  return (
    <button className={styles.userBtn} onClick={() => router.push('/user')} title="账号设置">
      <FaIcon name="user" />
      <UserName username={session.username} className={styles.userName} hideTags />
    </button>
  )
}
