'use client'

import type { Comment, CommentsData } from '@/types/gist'
import { encrypt, decrypt } from './gist-crypto'

const GIST_ID = process.env.NEXT_PUBLIC_GIST_ID!
const TOKEN = process.env.NEXT_PUBLIC_GIST_TOKEN!
const GIST_API = `https://api.github.com/gists/${GIST_ID}`

// ---------- 缓存 ----------
let cache: {
  data: CommentsData | null
  timestamp: number
} = { data: null, timestamp: 0 }
const CACHE_TTL = 30_000 // 30 秒

function isCacheValid(): boolean {
  return cache.data !== null && Date.now() - cache.timestamp < CACHE_TTL
}

// ---------- 读取 ----------

/** 从 Gist 拉取 comments.json 全文 */
export async function fetchComments(forceRefresh = false): Promise<CommentsData> {
  if (!forceRefresh && isCacheValid()) return cache.data!

  const res = await fetch(GIST_API, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next: { revalidate: 30 },
  })

  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)

  const gist = await res.json()
  const raw = gist.files?.['comments.json']?.content
  if (!raw) return {}

  // 如果是密文就解密，否则当明文 JSON 解析（兼容旧数据）
  const isEncrypted = !raw.startsWith('{') && !raw.startsWith('[')
  const json = isEncrypted ? await decrypt(raw) : raw
  const data: CommentsData = JSON.parse(json)
  cache = { data, timestamp: Date.now() }
  return data
}

/** 获取某个页面的已审核评论 */
export async function getPageComments(page: string): Promise<Comment[]> {
  const all = await fetchComments()
  return (all[page] ?? []).filter((c) => c.status === 'approved')
}

// ---------- 限流 ----------

const RATE_LIMIT_KEY = 'wiki_comment_timestamps'
const MAX_COMMENTS = 60
const WINDOW_MS = 60 * 60 * 1000 // 1 小时

/** 检查是否超过限流，未超过则记录本次提交 */
function checkRateLimit(): void {
  if (typeof window === 'undefined') return
  const stored = localStorage.getItem(RATE_LIMIT_KEY)
  const timestamps: number[] = stored ? JSON.parse(stored) : []
  const now = Date.now()
  // 清除窗口外的旧时间戳
  const recent = timestamps.filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_COMMENTS) {
    const oldest = recent[0]
    const waitMs = WINDOW_MS - (now - oldest)
    const waitMin = Math.ceil(waitMs / 60000)
    throw new Error(`评论太频繁，请 ${waitMin} 分钟后再试（限制 ${MAX_COMMENTS} 条/小时）`)
  }
  recent.push(now)
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent))
}

// ---------- 写入 ----------

/** 添加新评论（写回 Gist） */
export async function addComment(
  page: string,
  input: { author: string; content: string; parentId?: string },
): Promise<void> {
  checkRateLimit() // 同一设备 60 条/小时
  const all = await fetchComments(true) // 跳过缓存，拿最新防覆盖
  const list = all[page] ?? []

  const comment: Comment = {
    id: crypto.randomUUID(),
    page,
    author: input.author.trim() || '匿名',
    content: input.content,
    date: new Date().toISOString(),
    parentId: input.parentId,
    status: 'approved', // Phase 2 改为 pending，由管理员审核
  }

  list.push(comment)

  const updated: CommentsData = { ...all, [page]: list }
  await writeComments(updated)
}

/** 覆盖写入 comments.json（先加密再写入） */
async function writeComments(data: CommentsData): Promise<void> {
  const encrypted = await encrypt(JSON.stringify(data, null, 2))
  const body = JSON.stringify({
    files: { 'comments.json': { content: encrypted } },
  })

  const res = await fetch(GIST_API, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`写入 Gist 失败 (${res.status}): ${err}`)
  }

  // 更新缓存
  cache = { data, timestamp: Date.now() }
}
