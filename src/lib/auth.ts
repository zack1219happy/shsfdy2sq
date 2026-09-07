/**
 * 认证逻辑层 — Supabase Auth 驱动
 */
import { supabase } from "./supabase";

const SESSION_KEY = "wiki_session";
const RPC_FALLBACK_SESSION_KEY = "wiki_rpc_fallback";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_STORAGE_KEYS = [
  "sb-iiiyoafpzfqxpaqheojg-auth-token",
  "sb-iiiyoafpzfqxpaqheojg-provider-token",
] as const;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface UserSession {
  userId: string;
  username: string;
  studentId: string;
  name: string;
  role: string;
  loginTime: string;
}

export function getSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<UserSession>;
    if (
      typeof session.userId !== 'string' ||
      typeof session.username !== 'string' ||
      !session.username ||
      typeof session.studentId !== 'string' ||
      !session.studentId ||
      typeof session.role !== 'string' ||
      !session.role ||
      typeof session.loginTime !== 'string'
    ) {
      clearStoredSession();
      return null;
    }
    const age = Date.now() - new Date(session.loginTime).getTime();
    if (!Number.isFinite(age) || age > SESSION_MAX_AGE_MS || age < -SESSION_CLOCK_SKEW_MS) {
      clearStoredSession();
      return null;
    }
    return session as UserSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  clearStoredSession();
  void supabase.auth.signOut().catch(() => {});
}

export function isRpcFallbackSession(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(RPC_FALLBACK_SESSION_KEY) === "1";
}

/**
 * 判断当前用户是否有权限删除指定用户的评论
 */
export function canDeleteComment(
  session: UserSession | null,
  commentUserId?: string,
): boolean {
  if (!session) return false
  if (session.role === 'super_admin') return true
  if (session.role === 'admin' && commentUserId !== session.userId) return true
  if (commentUserId && commentUserId === session.userId) return true
  return false
}

export interface LoginResult {
  success: boolean;
  message: string;
  bannedUntil?: string | null; // ISO 时间戳，非空 = 被封禁
}

type LoginStatus = 'success' | 'banned' | 'ip_required';

/** login RPC 返回的用户行 */
interface LoginUserRow {
  id?: string | null;
  username?: string | null;
  username_out?: string | null;
  student_id?: string | null;
  name?: string | null;
  role?: string | null;
  has_password?: boolean | null;
  banned_until?: string;
  login_status?: LoginStatus;
}

interface CurrentUserRow {
  id: string;
  username: string;
  name: string;
  student_id: string;
  role: string;
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(RPC_FALLBACK_SESSION_KEY);
  for (const key of AUTH_STORAGE_KEYS) localStorage.removeItem(key);
}

function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of AUTH_STORAGE_KEYS) localStorage.removeItem(key);
}

function clearAuthOnlySession(): void {
  clearAuthStorage();
  void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

function clearLocalAuthSession(): void {
  clearStoredSession();
  void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

export async function login(
  nameOrUsername: string,
  credential: string,
): Promise<LoginResult> {
  const trimmed = nameOrUsername.trim();

  // 获取客户端公网 IP（通过免费 IP 服务）
  let clientIp: string | null = null;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    if (typeof data?.ip === 'string' && data.ip.trim()) clientIp = data.ip.trim();
  } catch { /* 没有白名单时继续登录；白名单启用时由 RPC 负责拒绝缺失 IP */ }

  const { data, error } = await supabase.rpc("login", {
    p_name_or_username: trimmed,
    p_password: credential,
    p_client_ip: clientIp || null,
  });

  if (error) {
    return { success: false, message: "登录服务暂时不可用，请稍后重试" };
  }

  const user = (data as LoginUserRow[])?.[0];
  if (!user) {
    return { success: false, message: "姓名/用户名或密码错误，请检查后重试" };
  }

  if (user.login_status === 'ip_required') {
    return { success: false, message: "当前网络无法完成安全验证，请稍后重试" };
  }

  // 封禁检查
  if (user.login_status === 'banned' || user.banned_until) {
    const bannedUntil = user.banned_until;
    if (!bannedUntil) {
      return { success: false, message: "账号当前无法登录，请稍后重试" };
    }
    const until = new Date(bannedUntil);
    const fmt = until.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    return {
      success: false,
      message: `您因恶意盗号被封禁至 ${fmt}`,
      bannedUntil,
    };
  }

  if (user.login_status && user.login_status !== 'success') {
    return { success: false, message: "姓名/用户名或密码错误，请检查后重试" };
  }

  if (!user.id || !user.student_id) {
    return { success: false, message: "登录服务返回了无效账号信息，请稍后重试" };
  }

  const username = user.username || user.username_out;
  if (!username || !user.name) {
    return { success: false, message: "登录服务返回了无效账号信息，请稍后重试" };
  }

  // Try to establish Auth session
  const email = user.student_id + "@wiki.local";
  const signIn = async (password: string) => {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (
        authError ||
        !authData.session ||
        !authData.user ||
        authData.user.id !== user.id
      ) {
        return null;
      }
      return authData.session;
    } catch {
      return null;
    }
  };

  let authSession = await signIn(credential);

  // 兼容旧账号：数据库密码已更新，但 Auth 仍保留学号时，用学号建立一次会话并同步。
  if (!authSession && user.has_password) {
    authSession = await signIn(user.student_id);
    if (authSession) {
      const { error: syncError } = await supabase.auth.updateUser({ password: credential });
      if (syncError) {
        clearLocalAuthSession();
        return { success: false, message: "密码认证未同步完成，请稍后重试" };
      }
    }
  } else if (!authSession && !user.has_password) {
    authSession = await signIn(user.student_id);
  }

  if (!authSession) {
    localStorage.setItem(RPC_FALLBACK_SESSION_KEY, "1");
    clearAuthOnlySession();
  } else {
    localStorage.removeItem(RPC_FALLBACK_SESSION_KEY);
  }

  const session: UserSession = {
    userId: user.id,
    username,
    studentId: user.student_id || "",
    name: user.name,
    role: user.role || "user",
    loginTime: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, message: "登录成功" };
}

export async function tryRestoreSessionFromAuth(): Promise<void> {
  if (isRpcFallbackSession()) {
    getSession();
    return;
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    clearLocalAuthSession();
    return;
  }

  const { data, error } = await supabase.rpc('get_current_user');
  const current = (data as CurrentUserRow[])?.[0];
  if (error || !current || current.id !== user.id) {
    clearLocalAuthSession();
    return;
  }

  const restored: UserSession = {
    userId: current.id,
    username: current.username,
    studentId: current.student_id,
    name: current.name,
    role: current.role,
    loginTime: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(restored));
}

export async function logout(): Promise<void> {
  clearSession();
}

export async function setPassword(
  studentId: string,
  oldCredential: string,
  newPassword: string,
): Promise<LoginResult> {
  const currentSession = getSession();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !currentSession || user.id !== currentSession.userId) {
    clearLocalAuthSession();
    return { success: false, message: "登录会话已失效，请重新登录" };
  }

  const { data: valid, error: verifyError } = await supabase.rpc("verify_password", {
    p_student_id: studentId,
    p_password: oldCredential,
  });
  if (verifyError) return { success: false, message: "当前密码验证失败，请稍后重试" };
  if (!valid) return { success: false, message: "当前密码错误" };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { success: false, message: "认证密码更新失败，应用密码未修改" };
  }

  const { data, error } = await supabase.rpc("set_password", {
    p_student_id: studentId,
    p_old_password: oldCredential,
    p_new_password: newPassword,
  });
  if (error || !data) {
    return {
      success: false,
      message: "认证密码已更新，但应用密码同步失败，请保持当前登录状态并重试",
    };
  }
  return { success: true, message: "密码设置成功" };
}

export async function changeUsername(
  studentId: string,
  password: string,
  newUsername: string,
): Promise<LoginResult> {
  const session = getSession();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !session || user.id !== session.userId) {
    clearLocalAuthSession();
    return { success: false, message: "登录会话已失效，请重新登录" };
  }

  const { data, error } = await supabase.rpc("change_username", {
    p_student_id: studentId,
    p_password: password,
    p_new_username: newUsername.trim(),
  });
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "修改用户名失败" };

  const storedSession = getSession();
  if (storedSession) {
    storedSession.username = newUsername.trim();
    localStorage.setItem(SESSION_KEY, JSON.stringify(storedSession));
  }
  return { success: true, message: "用户名修改成功" };
}
