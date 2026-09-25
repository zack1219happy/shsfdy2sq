/* ============================================
   MarkdownEditor — @ 提及与表情自动补全
   --------------------------------------------
   敲 @  → 用户名候选（一行一个，只显示用户名）
   敲 {  → 我的表情包 + 我的散表情
   敲 {包名: → 该包内的表情
   代码块 / 行内代码里一律不弹。
   ============================================ */
'use client'

import { autocompletion, startCompletion, type Completion, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { supabase } from '@/lib/supabase'
import { loadLibrary, currentUserId } from '@/lib/emoji/store'
import { loadMentionUsers } from '@/lib/mention/store'
import type { EmojiItem } from '@/lib/emoji/types'

/**
 * 光标是否在代码语境里：
 * 1) 行内代码 `…` 未配对  2) 处于 ``` 围栏内
 */
export function insideCode(doc: string, pos: number): boolean {
  const before = doc.slice(0, pos)
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  const fences = before.match(/^```/gm)
  if (fences && fences.length % 2 === 1) return true
  const ticks = (line.match(/`/g) || []).length
  return ticks % 2 === 1
}

/* ---------- 用户名候选 ---------- */

type UserRow = { username: string; name: string }

let userCache: UserRow[] | null = null
let initialsCache: Map<string, string> | null = null

async function allUsers(): Promise<UserRow[]> {
  if (userCache) return userCache
  await loadMentionUsers()
  const { data } = await supabase.rpc('mention_search_users', { p_query: '' })
  userCache = (data ?? []) as UserRow[]
  return userCache
}

/** 姓名 → 首字母（库里现成的表，不自己编） */
async function nameInitials(): Promise<Map<string, string>> {
  if (initialsCache) return initialsCache
  const { data } = await supabase.rpc('get_all_pinyin_initials')
  const map = new Map<string, string>()
  for (const row of (data ?? []) as { name: string; initials: string }[]) {
    if (row?.name) map.set(row.name, (row.initials ?? '').toLowerCase())
  }
  initialsCache = map
  return map
}

/**
 * 匹配四项：用户名 / 姓名 / 学号 / 姓名首字母。
 * test 与 admin_wz 由数据库端 get_all_users 的口径排除。
 */
async function mentionCandidates(query: string): Promise<UserRow[]> {
  const q = query.toLowerCase()
  if (!q) return allUsers()

  const { data } = await supabase.rpc('mention_search_users', { p_query: query })
  const direct = (data ?? []) as UserRow[]
  if (direct.length > 0) return direct

  // 兜底：首字母 / 姓名「包含」匹配（库里是前缀 LIKE）
  const [users, initials] = await Promise.all([allUsers(), nameInitials()])
  return users.filter((u) => {
    const ini = initials.get(u.name ?? '') ?? ''
    return ini.includes(q) || (u.name ?? '').toLowerCase().includes(q)
  })
}

const mentionSource: CompletionSource = async (cx): Promise<CompletionResult | null> => {
  const before = cx.state.sliceDoc(0, cx.pos)
  const m = /(^|[^0-9A-Za-z_.-])@([A-Za-z0-9_-]{0,32})$/.exec(before)
  if (!m) return null
  const query = m[2]
  const users = await mentionCandidates(query)

  const seen = new Set<string>()
  const options: Completion[] = []
  for (const u of users) {
    if (!u.username || seen.has(u.username)) continue
    seen.add(u.username)
    options.push({
      // 一行一个：只显示用户名
      label: u.username,
      apply: u.username + ' ',
      type: 'user',
    })
  }
  if (options.length === 0) return null
  // The source matches usernames, pinyin initials, and student numbers, while
  // the visible label is always the username. Let the source keep its own
  // result set instead of having CodeMirror filter it by the username label.
  return { from: cx.pos - query.length, options, filter: false }
}

/* ---------- 表情候选 ---------- */

function emojiCompletion(e: EmojiItem): Completion {
  return {
    label: e.name,
    // 一行一个：只显示表情名
    apply: `${e.name}}`,
    type: 'value',
  }
}

function packCompletion(packName: string): Completion {
  return {
    label: packName,
    // 当前输入已经包含「{」，这里只补包名和冒号。
    apply(view, _completion, from, to) {
      const insert = `${packName}:`
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      })
      // 选中包名后立即打开包内表情候选，不要求用户重新输入冒号。
      startCompletion(view)
    },
    type: 'namespace',
  }
}

const emojiSource: CompletionSource = async (cx): Promise<CompletionResult | null> => {
  const before = cx.state.sliceDoc(0, cx.pos)
  const packMatch = /\{([^{}\s:]{1,24}):([^{}\s]{0,24})$/.exec(before)
  const plainMatch = /\{([^{}\s:]{0,24})$/.exec(before)
  if (!packMatch && !plainMatch) return null

  const lib = await loadLibrary(currentUserId())
  if (!lib) return null

  if (packMatch) {
    const packName = packMatch[1]
    const query = packMatch[2]
    const target = lib.packs.find((p) => p.name === packName)
    if (!target) return null
    const options = target.emojis
      .filter((e) => !e.banned && e.name.toLowerCase().includes(query.toLowerCase()))
      .map((e) => emojiCompletion(e))
    if (options.length === 0) return null
    return { from: cx.pos - query.length, options, validFor: /^[^{}\s:]*$/ }
  }

  const query = plainMatch![1]
  const lower = query.toLowerCase()
  const options: Completion[] = [
    // 先列表情包，再列散表情
    ...lib.packs
      .filter((p) => p.name.toLowerCase().includes(lower))
      .map((p) => packCompletion(p.name)),
    ...lib.emojis
      .filter((e) => !e.banned && e.name.toLowerCase().includes(lower))
      .map((e) => emojiCompletion(e)),
  ]
  if (options.length === 0) return null
  return { from: cx.pos - query.length, options, validFor: /^[^{}:\s]*$/ }
}

/** 空库时给一句引导，而不是默默什么都不弹 */
const emptyHintSource: CompletionSource = (cx) => {
  const before = cx.state.sliceDoc(0, cx.pos)
  if (!/\{[^{}\s]*$/.test(before)) return null
  return {
    from: cx.pos,
    options: [{ label: '表情库是空的：去「表情包」页添加，或右键别人的表情加入', apply: '', disabled: true }],
    validFor: /^$/,
  }
}

export interface EditorCompletionOptions {
  /** wiki / 公告这类无主内容：不解析表情，补全也关掉 */
  disableEmoji?: boolean
}

/** @ 与表情两个候选源（互斥，按光标前文本判断） */
export function editorCompletionExtensions(options: EditorCompletionOptions = {}): Extension {
  const source: CompletionSource = async (cx) => {
    const doc = cx.state.sliceDoc()
    if (insideCode(doc, cx.pos)) return null

    const before = doc.slice(0, cx.pos)
    if (/@[A-Za-z0-9_-]{0,32}$/.test(before)) return mentionSource(cx)
    if (options.disableEmoji) return null

    const result = await emojiSource(cx)
    if (result) return result

    const lib = await loadLibrary(currentUserId())
    if (/\{[^{}\s]*$/.test(before) && !lib?.emojis.length && !lib?.packs.length) {
      return emptyHintSource(cx)
    }
    return null
  }

  return autocompletion({
    override: [source],
    activateOnTyping: true,
    maxRenderedOptions: 30,
    defaultKeymap: true,
  })
}
