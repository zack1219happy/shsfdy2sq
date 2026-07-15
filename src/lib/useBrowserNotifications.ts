'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BASE_PATH } from '@/lib/constants'

/**
 * 通知类型 → 通知标题映射
 */
const TITLES: Record<string, string> = {
  comment_reply: '💬 评论回复',
  page_owner: '📄 页面评论',
  forum_reply: '💭 论坛回复',
  forum_post_update: '📝 论坛动态',
  forum_own_post: '📌 你的帖子',
  dm: '✉️ 新私信',
  wish_reply: '📋 工单回复',
  wish_status_update: '📋 工单动态',
}

function titleForType(type: string): string {
  return TITLES[type] || '🔔 新通知'
}

/**
 * 通过 Supabase Realtime 订阅通知和私信，页面在后台时弹出系统通知。
 *
 * 前提（需在 Supabase Dashboard 执行）:
 *   1. ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
 *   2. 已存在 SELECT RLS policy (auth.uid() = user_id)
 */
export function useBrowserNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId) return
    if (!('Notification' in window)) return

    /* ── 普通通知（评论回复、论坛动态等） ── */
    const notifChannel = supabase
      .channel('notif-browser')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const n = payload.new as {
            type: string
            excerpt: string | null
          }
          window.dispatchEvent(new CustomEvent('new-notification'))
          if (!document.hidden) return
          showNotif(titleForType(n.type), n.excerpt || '您有一条新通知')
        },
      )
      .subscribe()

    /* ── 私信（private_messages 表，由 RLS 控制可见性） ── */
    const dmChannel = supabase
      .channel('dm-browser')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          // 不传 filter — RLS 自动过滤，仅投递用户有权限的消息
        },
        (payload: any) => {
          const msg = payload.new as {
            sender_id: string
            content: string
          }
          // 跳过自己发出的消息
          if (msg.sender_id === userId) return

          window.dispatchEvent(new CustomEvent('new-dm'))
          if (!document.hidden) return
          showNotif('✉️ 新私信', (msg.content || '').slice(0, 100) || '您有一条新私信')
        },
      )
      .subscribe()

    return () => {
      notifChannel.unsubscribe()
      dmChannel.unsubscribe()
    }
  }, [userId])
}

function showNotif(title: string, body: string) {
  // 权限检查
  if (Notification.permission !== 'granted') {
    if (Notification.permission === 'default') {
      // 权限尚未请求 – 等用户点击铃铛时触发
    }
    return
  }

  try {
    const origin = window.location.origin
    const icon = `${origin}${BASE_PATH}/logo.webp`
    const n = new Notification(title, { body, icon, tag: 'wiki-notif' })
    n.onclick = () => {
      window.focus()
      window.location.href = `${origin}${BASE_PATH}/notice`
      n.close()
    }
  } catch {
    // 少数浏览器在非用户手势调用 new Notification() 时抛出 SecurityError
  }
}

/**
 * 请求浏览器通知权限。
 * 必须由用户手势触发（如点击铃铛按钮），否则大部分浏览器会静默拒绝。
 */
export function requestNotificationPermission(): void {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}
