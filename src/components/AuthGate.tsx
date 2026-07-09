'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSession,
  login,
  clearSession,
  setPassword,
  changeUsername,
  type LoginResult,
  type UserSession,
} from '@/lib/auth'
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
      <UserMenu session={session} onLogout={handleLogout} />
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
        <FaIcon name="school" className={styles.cardLogo} />

        <h1>上中初二 Wiki</h1>
        <p className={styles.cardSubtitle}>上海中学 2027 届 8 班 · 班级知识库</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="auth-name">姓名 / 用户名</label>
            <input
              id="auth-name"
              type="text"
              placeholder="真实姓名或用户名（如 tqy）"
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
              placeholder="未设密码则填学号，已设密码则填密码"
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
      <div ref={menuRef} style={{ position: 'fixed', top: 12, right: 16, zIndex: 1500 }}>
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
