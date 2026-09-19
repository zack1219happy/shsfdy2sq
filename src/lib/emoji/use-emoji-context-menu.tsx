/* ============================================
   表情右键菜单 — 渲染出来的表情 / 表情包卡片通用
   --------------------------------------------
   - 普通用户右键「违规表情」占位 → 什么都不弹
   - 管理员右键「违规表情」占位 → 只给「解禁」
   - 别人的表情 → 「加入我的表情」；在包里再加「添加整个表情包」
   - 订阅来的包与自己的东西 → 不给添加项
   ============================================ */
'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { getSession } from '@/lib/auth'
import { showWarningToast } from '@/lib/toast'
import { copyEmoji, getLibrarySync, currentUserId, subscribePack, unbanEmoji } from '@/lib/emoji/store'
import { presentEmojiName, presentPackName } from '@/components/EmojiDialogHost'
import styles from '@/styles/emoji.module.css'
import type { EmojiTarget } from '@/lib/emoji/types'

interface MenuState {
  x: number
  y: number
  target: EmojiTarget
  isAdmin: boolean
  /** 右键的是表情包卡片 */
  packCard: boolean
}

const HOLDER_SELECTOR = '[data-emoji-name],[data-emoji-banned],[data-pack-source-user]'

function isAdminUser(): boolean {
  const role = getSession()?.role
  return role === 'admin' || role === 'super_admin'
}

function readTarget(holder: Element): { target: EmojiTarget; packCard: boolean } | null {
  if (holder.getAttribute('data-pack-source-user') !== null) {
    return {
      packCard: true,
      target: {
        name: holder.getAttribute('data-pack-name') || '',
        pack: null,
        packId: holder.getAttribute('data-pack-id'),
        packSourceName: holder.getAttribute('data-pack-source-name') ?? null,
        hash: null,
        url: null,
        sourceUserId: holder.getAttribute('data-pack-source-user'),
        banned: false,
      },
    }
  }
  const holder2 = holder.closest('[data-emoji-name],[data-emoji-banned]')
  if (!holder2) return null
  return {
    packCard: false,
    target: {
      name: holder2.getAttribute('data-emoji-name') || '',
      pack: holder2.getAttribute('data-emoji-source-pack'),
      packId: holder2.getAttribute('data-emoji-source-pack-id'),
      packSourceName: holder2.getAttribute('data-emoji-source-pack-name'),
      hash: holder2.getAttribute('data-emoji-hash'),
      url: holder2.getAttribute('data-emoji-url'),
      sourceUserId: holder2.getAttribute('data-emoji-source-user'),
      banned: holder2.getAttribute('data-emoji-banned') === '1',
    },
  }
}

/** 这个包是不是我库里的（自己创建的或已订阅的） */
function isMyPack(packId: string | null): boolean {
  if (!packId) return false
  const lib = getLibrarySync(currentUserId())
  if (!lib) return false
  return lib.packs.some((p) => p.id === packId)
}

/** 这个表情是不是我库里的 */
function isMyEmoji(name: string, packName: string | null): boolean {
  const lib = getLibrarySync(currentUserId())
  if (!lib) return false
  if (packName) {
    const pack = lib.packs.find((p) => p.name === packName || p.source_name === packName)
    return pack ? pack.emojis.some((e) => e.name === name) : false
  }
  return lib.emojis.some((e) => e.name === name)
}

function hasMenuAction(target: EmojiTarget, packCard: boolean, isAdmin: boolean): boolean {
  if (target.banned) return isAdmin

  const mine = target.sourceUserId === currentUserId()
    || (target.packId !== null && isMyPack(target.packId))
    || (!packCard && isMyEmoji(target.name, target.packSourceName ?? target.pack))
  return !mine
}

/** 我库里已占用的名字（表情名 + 包名），用于撞名红框 */
function myTakenNames(): string[] {
  const lib = getLibrarySync(currentUserId())
  if (!lib) return []
  return [...lib.emojis.map((e) => e.name), ...lib.packs.map((p) => p.name)]
}

/**
 * 给一块渲染出来的内容挂表情右键菜单。
 * 返回的 menu 由调用方渲染（固定定位，不受容器裁剪）。
 */
export function useEmojiContextMenu(ref: React.RefObject<HTMLElement | null>): ReactNode {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const close = useCallback(() => setMenu(null), [])

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const root = ref.current
      if (!root || !root.contains(e.target as Node)) return

      const el = (e.target as Element | null)?.closest?.(HOLDER_SELECTOR)
      if (!el) {
        e.preventDefault()
        e.stopPropagation()
        setMenu(null)
        return
      }
      const parsed = readTarget(el)
      if (!parsed) return
      const admin = isAdminUser()
      // 普通用户右键违规占位：什么都不弹
      if (parsed.target.banned && !admin) {
        e.preventDefault()
        e.stopPropagation()
        setMenu(null)
        return
      }
      // 捕获阶段拦下：表情上的右键不再触发这块内容自己的右键菜单
      e.preventDefault()
      e.stopPropagation()
      if (!hasMenuAction(parsed.target, parsed.packCard, admin)) {
        setMenu(null)
        return
      }
      setMenu({ x: e.clientX, y: e.clientY, target: parsed.target, isAdmin: admin, packCard: parsed.packCard })
    }

    document.addEventListener('contextmenu', onContext, true)
    return () => document.removeEventListener('contextmenu', onContext, true)
  }, [ref])

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!menu) return null

  const { target } = menu
  // 「自己的东西」：归属是我，或这个东西已经在我库里
  const mine = target.sourceUserId === currentUserId()
    || (target.packId !== null && isMyPack(target.packId))
    || (!menu.packCard && isMyEmoji(target.name, target.packSourceName ?? target.pack))

  const doUnban = async () => {
    if (!target.hash) return
    try {
      await unbanEmoji(target.hash)
      showWarningToast('已解禁，这个表情恢复显示')
    } catch (e) {
      showWarningToast((e as Error).message || '解禁失败')
    }
  }

  const doCopy = async () => {
    if (!target.sourceUserId) return
    const name = await presentEmojiName(target.name, myTakenNames())
    if (!name) return
    try {
      await copyEmoji({
        sourceUserId: target.sourceUserId,
        name: target.name,
        packName: target.packSourceName ?? target.pack,
        newName: name,
      })
      showWarningToast('已加入我的表情')
    } catch (e) {
      showWarningToast((e as Error).message || '添加失败')
    }
  }

  const doSubscribe = async () => {
    if (!target.packId) { showWarningToast('找不到这个表情包，请刷新后再试'); return }
    const label = target.packSourceName ?? target.pack ?? target.name
    const name = await presentPackName(label, myTakenNames())
    if (!name) return
    try {
      await subscribePack(target.packId, name)
      showWarningToast('已添加整个表情包')
    } catch (e) {
      showWarningToast((e as Error).message || '添加失败')
    }
  }

  const showCopy = !target.banned && !mine && !menu.packCard
  const showSubscribe = !target.banned && !mine && (menu.packCard || target.packId !== null)

  return (
    <div
      className={styles.ctxMenu}
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      {target.banned && menu.isAdmin && (
        <button type="button" className={styles.ctxItem} onClick={() => { close(); void doUnban() }}>
          解禁这个表情
        </button>
      )}
      {showCopy && (
        <button type="button" className={styles.ctxItem} onClick={() => { close(); void doCopy() }}>
          加入我的表情
        </button>
      )}
      {showSubscribe && (
        <button type="button" className={styles.ctxItem} onClick={() => { close(); void doSubscribe() }}>
          {menu.packCard ? '添加' : '添加整个表情包'}
        </button>
      )}
    </div>
  )
}
