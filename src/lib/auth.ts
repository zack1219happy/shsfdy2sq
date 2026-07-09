/**
 * 认证逻辑层 — 学号登录 / 密码登录 / Session 管理
 *
 * 遵循 src/lib/gist-api.ts 的 Supabase 调用风格。
 * 所有登录/修改操作均通过 Supabase RLS 或 SECURITY DEFINER RPC 完成。
 */

import { supabase } from './supabase'
import { hashPassword } from './crypto'

// ---------- 常量 ----------

const SESSION_KEY = 'wiki_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 天

// ---------- 类型 ----------

export interface UserSession {
  userId: string
  username: string
  studentId: string
  name: string
  loginTime: string
}

interface WikiUser {
  id: string
  student_id: string
  name: string
  username: string
  password_hash: string | null
}

// ---------- Session 管理 ----------

export function getSession(): UserSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    // 迁移：旧格式没有 username，清掉
    if (!session.username) {
      clearSession()
      return null
    }
    const age = Date.now() - new Date(session.loginTime).getTime()
    if (age > SESSION_MAX_AGE_MS) {
      clearSession()
      return null
    }
    return session as UserSession
  } catch {
    return null
  }
}

function saveSession(user: {
  id: string
  username: string
  student_id: string
  name: string
}): void {
  const session: UserSession = {
    userId: user.id,
    username: user.username,
    studentId: user.student_id,
    name: user.name,
    loginTime: new Date().toISOString(),
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_KEY)
}

export function isLoggedIn(): boolean {
  return getSession() !== null
}

// ---------- 统一登录 ----------

export interface LoginResult {
  success: boolean
  message: string
}

/**
 * 统一登录 — 单表单，支持姓名/用户名，自动检测密码/学号。
 *
 * 流程：
 * 1. 先按 name 查表，找不到再按 username 查
 * 2. 有密码 → hash 输入 → 比对
 * 3. 无密码 → 输入与 student_id 比对
 */
export async function login(
  nameOrUsername: string,
  credential: string,
): Promise<LoginResult> {
  const trimmed = nameOrUsername.trim()

  // 先按 name 查
  let { data, error } = await supabase
    .from('wiki_users')
    .select('id, student_id, name, username, password_hash')
    .eq('name', trimmed)
    .maybeSingle<WikiUser>()

  // 没找到再按 username 查
  if (!data) {
    const result = await supabase
      .from('wiki_users')
      .select('id, student_id, name, username, password_hash')
      .eq('username', trimmed)
      .maybeSingle<WikiUser>()
    data = result.data
    error = result.error
  }

  if (!data) {
    return { success: false, message: '姓名或用户名不存在，请检查后重试' }
  }

  // 有密码 → 走密码验证
  if (data.password_hash !== null) {
    const inputHash = await hashPassword(credential)
    if (inputHash !== data.password_hash) {
      return { success: false, message: '姓名/用户名或密码错误，请重新输入' }
    }
    saveSession(data)
    return { success: true, message: '登录成功' }
  }

  // 无密码 → 验证输入是否为学号
  if (credential.trim() === data.student_id) {
    saveSession(data)
    return { success: true, message: '登录成功' }
  }

  return { success: false, message: '姓名/用户名或密码错误，请重新输入' }
}

export async function logout(): Promise<void> {
  clearSession()
}

// ---------- 密码管理 ----------

/**
 * 统一设置/修改密码 — 有密码验密码，无密码验学号。
 * credential: 当前密码（有密码时）或学号（无密码时）
 */
export async function setPassword(
  studentId: string,
  credential: string,
  newPassword: string,
): Promise<LoginResult> {
  const newHash = await hashPassword(newPassword)
  const credHash = await hashPassword(credential)

  const { data, error } = await supabase.rpc('set_password', {
    p_student_id: studentId,
    p_credential: credHash,
    p_new_password_hash: newHash,
    p_student_id_raw: credential,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  if (!data) {
    return { success: false, message: '密码设置失败' }
  }

  return { success: true, message: '密码设置成功' }
}

// ---------- 用户名管理 ----------

/**
 * 修改用户名 — 有密码验密码，无密码验学号。校验在 RPC 端。
 */
export async function changeUsername(
  studentId: string,
  credential: string,
  newUsername: string,
): Promise<LoginResult> {
  const credHash = await hashPassword(credential)

  const { data, error } = await supabase.rpc('change_username', {
    p_student_id: studentId,
    p_password_hash: credHash,
    p_new_username: newUsername.trim(),
    p_student_id_raw: credential,
  })

  if (error) {
    return { success: false, message: error.message }
  }

  if (!data) {
    return { success: false, message: '修改用户名失败' }
  }

  const session = getSession()
  if (session) {
    session.username = newUsername.trim()
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }

  return { success: true, message: '用户名修改成功' }
}
