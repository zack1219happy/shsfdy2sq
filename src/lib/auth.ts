/**
 * 认证逻辑层 — Supabase Auth 驱动
 */
import { supabase } from "./supabase";

const SESSION_KEY = "wiki_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
    const session = JSON.parse(raw);
    if (!session.username || !session.role) {
      clearSession();
      return null;
    }
    const age = Date.now() - new Date(session.loginTime).getTime();
    if (age > SESSION_MAX_AGE_MS) {
      clearSession();
      return null;
    }
    return session as UserSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("sb-iiiyoafpzfqxpaqheojg-auth-token");
  localStorage.removeItem("sb-iiiyoafpzfqxpaqheojg-provider-token");
  supabase.auth.signOut().catch(() => {});
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
}

export async function login(
  nameOrUsername: string,
  credential: string,
): Promise<LoginResult> {
  const trimmed = nameOrUsername.trim();
  const { data, error } = await supabase.rpc("login", {
    p_name_or_username: trimmed,
    p_password: credential,
  });

  const user = (data as any[])?.[0];
  if (!user) {
    return { success: false, message: "姓名/用户名或密码错误，请检查后重试" };
  }

  // Try to establish Auth session
  const email = user.student_id + "@wiki.local";
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: credential,
  });

  if (authError && user.has_password) {
    const { error: fallbackError } = await supabase.auth.signInWithPassword({
      email,
      password: user.student_id,
    });
    if (!fallbackError) {
      await supabase.auth.updateUser({ password: credential });
    } else {
      console.warn("Auth session 建立失败，仅使用 localStorage session", fallbackError.message);
    }
  } else if (authError && !user.has_password) {
    const { error: retryError } = await supabase.auth.signInWithPassword({
      email,
      password: user.student_id,
    });
    if (retryError) {
      console.warn("Auth session 建立失败，仅使用 localStorage session", retryError.message);
    }
  }

  const session: UserSession = {
    userId: user.id,
    username: user.username || "",
    studentId: user.student_id || "",
    name: user.name || "",
    role: user.role || "user",
    loginTime: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, message: "登录成功" };
}

export async function tryRestoreSessionFromAuth(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const existing = getSession();
  if (existing) return;
  const meta = session.user.user_metadata;
  if (meta?.username) {
    const restored: UserSession = {
      userId: session.user.id,
      username: meta.username || "",
      studentId: meta.student_id || "",
      name: meta.name || "",
      role: meta.role || "user",
      loginTime: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(restored));
  }
}

export async function logout(): Promise<void> {
  clearSession();
}

export async function setPassword(
  studentId: string,
  oldCredential: string,
  newPassword: string,
): Promise<LoginResult> {
  const { data, error } = await supabase.rpc("set_password", {
    p_student_id: studentId,
    p_old_password: oldCredential,
    p_new_password: newPassword,
  });
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "密码设置失败" };

  const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
  if (authError) console.warn("Auth 密码同步更新失败", authError.message);
  return { success: true, message: "密码设置成功" };
}

export async function changeUsername(
  studentId: string,
  password: string,
  newUsername: string,
): Promise<LoginResult> {
  const { data, error } = await supabase.rpc("change_username", {
    p_student_id: studentId,
    p_password: password,
    p_new_username: newUsername.trim(),
  });
  if (error) return { success: false, message: error.message };
  if (!data) return { success: false, message: "修改用户名失败" };

  const session = getSession();
  if (session) {
    session.username = newUsername.trim();
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  return { success: true, message: "用户名修改成功" };
}
