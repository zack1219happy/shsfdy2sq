'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSession,
  login,
  clearSession,
  setPassword,
  changeUsername,
  tryRestoreSessionFromAuth,
  type LoginResult,
  type UserSession,
} from '@/lib/auth'
import {
  fetchNotifications,
  getUnreadCount,
  markNotificationRead,
  clearAllNotifications,
  type Notification,
} from '@/lib/gist-api'
import styles from '@/styles/auth.module.css'
import FaIcon from '@/components/FaIcon'

/* ==============================================================
   AuthGate — 页面级登录门

   包裹整个 wiki 内容区域 + 右上角用户菜单：
   - 未登录 → 全屏登录界面（单表单，自动检测密码/学号）
   - 已登录 → 渲染 children + UserMenu
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

  if (!checked) return null
  if (!session) return <LoginScreen onSuccess={handleLoginSuccess} />

  return (
    <>
      <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 1500, display: 'flex', gap: 6 }}>
        <NotificationBell session={session} />
        <UserMenu session={session} onLogout={handleLogout} />
      </div>
      {children}
    </>
  )
}

/* ==============================================================
   LoginScreen — 全屏登录界面（统一表单，自动检测）
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setMessage(null)

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
        setMessage({ type: 'error', text: result.message })
      }
    },
    [name, credential, onSuccess],
  )

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <img src="/logo.png" alt="" className={styles.cardLogo} />

        <h1>上中初二 Wiki</h1>
        <p className={styles.cardSubtitle}>上海中学 2027 届 8 班 · 班级知识库</p>

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
    </div>
  )
}

/* ==============================================================
   UserMenu — 右上角用户菜单（已登录状态）
   ============================================================== */

function UserMenu({
  session,
  onLogout,
}: {
  session: UserSession
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const [showPwdModal, setShowPwdModal] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)

  return (
    <>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button className={styles.userBtn} onClick={() => setOpen(!open)}>
          <FaIcon name="user" />
          <span className={styles.userName}>{session.username}</span>
        </button>

        {open && (
          <div className={styles.dropdown}>
            <div className={styles.dropdownHeader}>
              <div className={styles.dropdownName}>{session.name}</div>
              <div className={styles.dropdownId}>@{session.username} · {session.studentId}</div>
            </div>

            <button
              className={styles.dropdownItem}
              onClick={() => { setShowPwdModal(true); setOpen(false) }}
            >
              <FaIcon name="key" />
              设置 / 修改密码
            </button>

            <button
              className={styles.dropdownItem}
              onClick={() => { setShowNameModal(true); setOpen(false) }}
            >
              <FaIcon name="pen" />
              修改用户名
            </button>

            <button
              className={`${styles.dropdownItem} ${styles.dropdownDanger}`}
              onClick={() => { onLogout(); setOpen(false) }}
            >
              <FaIcon name="sign-out-alt" />
              退出登录
            </button>
          </div>
        )}
      </div>

      {showPwdModal && (
        <PasswordModal studentId={session.studentId} onClose={() => setShowPwdModal(false)} />
      )}
      {showNameModal && (
        <NameModal studentId={session.studentId} currentUsername={session.username} onClose={() => setShowNameModal(false)} />
      )}
    </>
  )
}

/* ==============================================================
   NotificationBell — 消息通知铃铛
   ============================================================== */

function NotificationBell({ session }: { session: UserSession }) {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const lastRefreshRef = useRef(0)
  const THROTTLE_MS = 30_000

  // 初次加载未读数
  const loadUnread = useCallback(async () => {
    try { setUnread(await getUnreadCount()) }
    catch { /* ignore */ }
  }, [session.userId])

  // 全量加载（受 30 秒节流保护，force=true 跳过）
  const loadFull = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && now - lastRefreshRef.current < THROTTLE_MS) return
    lastRefreshRef.current = now
    try {
      const [n, u] = await Promise.all([
        fetchNotifications(),
        getUnreadCount(),
      ])
      setNotifs(n)
      setUnread(u)
    } catch { /* ignore */ }
  }, [session.userId])

  useEffect(() => {
    loadUnread()
  }, [loadUnread])

  const handleToggle = useCallback(() => {
    setOpen(prev => {
      if (!prev) {
        // 打开面板时刷新，30 秒内不重复拉取
        loadFull()
        // 未读数轻量查询不受限
        loadUnread()
      }
      return !prev
    })
  }, [loadFull, loadUnread])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const handleClear = useCallback(async () => {
    await clearAllNotifications()
    setUnread(0)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }, [session.userId])

  const handleClick = useCallback(async (id: string) => {
    await markNotificationRead(id)
    setUnread(prev => Math.max(0, prev - 1))
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [session.userId])

  // 监听新通知事件（跳过节流）
  useEffect(() => {
    const h = () => loadFull(true)
    window.addEventListener('new-notification', h)
    return () => window.removeEventListener('new-notification', h)
  }, [loadFull])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={styles.bellBtn} onClick={handleToggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className={styles.bellBadge}>{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className={styles.notifPanel}>
          <div className={styles.notifHeader}>
            <span>通知</span>
            {unread > 0 && (
              <button className={styles.notifClear} onClick={handleClear}>全部已读</button>
            )}
          </div>
          {notifs.length === 0 && <div className={styles.notifEmpty}>暂无通知</div>}
          {notifs.map(n => (
            <a
              key={n.id}
              className={`${styles.notifItem} ${n.read ? styles.notifRead : ''}`}
              href={n.page ? `/${n.page}/#comment-${n.id}` : undefined}
              onClick={() => handleClick(n.id)}
            >
              <span className={styles.notifFrom}>{n.from_username ?? '匿名'}</span>
              <span className={styles.notifText}>{n.excerpt ?? ''}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/* ==============================================================
   PasswordModal — 设置/修改密码弹窗
   ============================================================== */

function PasswordModal({
  studentId,
  onClose,
}: {
  studentId: string
  onClose: () => void
}) {
  const [credential, setCredential] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const handleSubmit = useCallback(async () => {
    setMessage(null)

    if (!newPwd) {
      setMessage({ type: 'error', text: '请输入新密码' })
      return
    }
    if (newPwd.length < 4) {
      setMessage({ type: 'error', text: '密码至少 4 位' })
      return
    }
    if (newPwd !== confirmPwd) {
      setMessage({ type: 'error', text: '两次输入的密码不一致' })
      return
    }
    if (!credential) {
      setMessage({ type: 'error', text: '请输入当前密码或学号' })
      return
    }

    setLoading(true)
    const result = await setPassword(studentId, credential, newPwd)
    setLoading(false)
    if (result.success) {
      setTimeout(onClose, 800)
    } else {
      setMessage({ type: 'error', text: result.message })
    }
  }, [studentId, credential, newPwd, confirmPwd, onClose])

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2>设置密码</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div>
          <div className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="pwd-cred">当前密码 / 学号</label>
              <input id="pwd-cred" type="password" placeholder="有密码填密码，无密码填学号" value={credential} onChange={(e) => setCredential(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="pwd-new">新密码</label>
              <input id="pwd-new" type="password" placeholder="至少 4 位" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoFocus />
            </div>
            <div className={styles.field}>
              <label htmlFor="pwd-confirm">确认新密码</label>
              <input id="pwd-confirm" type="password" placeholder="再次输入新密码" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
            </div>
            {message && (
              <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`}>
                {message.text}
              </div>
            )}
            <button className={styles.submitBtn} type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? '提交中…' : '确认'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ==============================================================
   NameModal — 修改用户名弹窗
   ============================================================== */

function NameModal({
  studentId,
  currentUsername,
  onClose,
}: {
  studentId: string
  currentUsername: string
  onClose: () => void
}) {
  const [newUsername, setNewUsername] = useState(currentUsername)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const handleSubmit = useCallback(async () => {
    setMessage(null)
    if (!newUsername.trim()) {
      setMessage({ type: 'error', text: '请输入新用户名' })
      return
    }
    setLoading(true)
    const result = await changeUsername(studentId, password, newUsername.trim())
    setLoading(false)
    if (result.success) {
      onClose()
      location.reload()
    } else {
      setMessage({ type: 'error', text: result.message })
    }
  }, [studentId, newUsername, password, onClose])

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h2>修改用户名</h2>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div>
          <div className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="name-new">新用户名</label>
              <input id="name-new" type="text" placeholder="新用户名" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus maxLength={20} />
            </div>
            <div className={styles.field}>
              <label htmlFor="name-pwd">密码 / 学号</label>
              <input id="name-pwd" type="password" placeholder="有密码填密码，无密码填学号" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {message && (
              <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`}>
                {message.text}
              </div>
            )}
            <button className={styles.submitBtn} type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? '提交中…' : '确认'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

