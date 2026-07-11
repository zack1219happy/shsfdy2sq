'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, setPassword, changeUsername, clearSession } from '@/lib/auth'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import type { UserSession } from '@/lib/auth'
import styles from '@/styles/auth.module.css'

export default function UserSettingsPage() {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)

  useEffect(() => {
    const s = getSession()
    if (!s) router.push('/')
    setSession(s)
  }, [router])

  if (!session) return null

  return (
    <div className={styles.settingsPage}>
      <h2 className={styles.settingsTitle}>
        <FaIcon name="user" /> 账号设置
      </h2>

      <div className={styles.settingsSection}>
        <h3 className={styles.settingsSectionTitle}>个人信息</h3>
        <div className={styles.settingsInfo}>
          <div className={styles.settingsInfoRow}>
            <span className={styles.settingsLabel}>姓名</span>
            <span>{session.name}</span>
          </div>
          <div className={styles.settingsInfoRow}>
            <span className={styles.settingsLabel}>用户名</span>
            <span><UserName username={session.username} /></span>
          </div>
          <div className={styles.settingsInfoRow}>
            <span className={styles.settingsLabel}>学号</span>
            <span>{session.studentId}</span>
          </div>
        </div>
      </div>

      <PasswordForm studentId={session.studentId} />

      <UsernameForm studentId={session.studentId} currentUsername={session.username} />

      <div className={styles.settingsSection}>
        <button
          className={styles.logoutBtn}
          onClick={() => { clearSession(); router.push('/') }}
        >
          <FaIcon name="sign-out-alt" /> 退出登录
        </button>
      </div>
    </div>
  )
}

/* ==============================================================
   PasswordForm — 设置/修改密码（内联表单）
   ============================================================== */

function PasswordForm({ studentId }: { studentId: string }) {
  const [credential, setCredential] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const handleSubmit = useCallback(async () => {
    setMessage(null)
    if (!newPwd) { setMessage({ type: 'error', text: '请输入新密码' }); return }
    if (newPwd.length < 4) { setMessage({ type: 'error', text: '密码至少 4 位' }); return }
    if (newPwd !== confirmPwd) { setMessage({ type: 'error', text: '两次输入的密码不一致' }); return }
    if (!credential) { setMessage({ type: 'error', text: '请输入当前密码或学号' }); return }
    setLoading(true)
    const result = await setPassword(studentId, credential, newPwd)
    setLoading(false)
    if (result.success) {
      setMessage({ type: 'success', text: '密码已更新' })
      setNewPwd(''); setConfirmPwd(''); setCredential('')
    } else {
      setMessage({ type: 'error', text: result.message })
    }
  }, [studentId, credential, newPwd, confirmPwd])

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.settingsSectionTitle}>修改密码</h3>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>当前密码 / 学号</label>
          <input type="password" placeholder="有密码填密码，无密码填学号" value={credential} onChange={(e) => setCredential(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>新密码</label>
          <input type="password" placeholder="至少 4 位" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>确认新密码</label>
          <input type="password" placeholder="再次输入新密码" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
        </div>
        {message && (
          <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`}>
            {message.text}
          </div>
        )}
        <button className={styles.submitBtn} type="button" onClick={handleSubmit} disabled={loading}>
          {loading ? '提交中…' : '更新密码'}
        </button>
      </div>
    </div>
  )
}

/* ==============================================================
   UsernameForm — 修改用户名（内联表单）
   ============================================================== */

function UsernameForm({ studentId, currentUsername }: { studentId: string; currentUsername: string }) {
  const [newUsername, setNewUsername] = useState(currentUsername)
  const [password, setPassword_] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  const handleSubmit = useCallback(async () => {
    setMessage(null)
    if (!newUsername.trim()) { setMessage({ type: 'error', text: '请输入新用户名' }); return }
    setLoading(true)
    const result = await changeUsername(studentId, password, newUsername.trim())
    setLoading(false)
    if (result.success) {
      setMessage({ type: 'success', text: '用户名已更新，请重新登录' })
    } else {
      setMessage({ type: 'error', text: result.message })
    }
  }, [studentId, newUsername, password])

  return (
    <div className={styles.settingsSection}>
      <h3 className={styles.settingsSectionTitle}>修改用户名</h3>
      <div className={styles.form}>
        <div className={styles.field}>
          <label>新用户名</label>
          <input type="text" placeholder="新用户名" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} maxLength={20} />
        </div>
        <div className={styles.field}>
          <label>密码 / 学号</label>
          <input type="password" placeholder="有密码填密码，无密码填学号" value={password} onChange={(e) => setPassword_(e.target.value)} />
        </div>
        {message && (
          <div className={`${styles.message} ${message.type === 'error' ? styles.error : styles.success}`}>
            {message.text}
          </div>
        )}
        <button className={styles.submitBtn} type="button" onClick={handleSubmit} disabled={loading}>
          {loading ? '提交中…' : '更新用户名'}
        </button>
      </div>
    </div>
  )
}
