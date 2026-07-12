// ============================================================
// 类型定义和纯函数 — 同时适用于服务端和客户端
// 不含 fs 等 Node.js 依赖
// ============================================================

export interface PersonEntry {
  initials: string
  name: string
  pinyin: string
  pinyinPrefix: string
  pinyinRestInitials: string
  hyphenForm: string
  oldSlug: string
  newSlug: string
  gender: string
}

export interface TeacherEntry {
  initials: string
  name: string
  pinyin: string
  pinyinPrefix: string
  pinyinRestInitials: string
  hyphenForm: string
  subject: string
}

export interface PersonRegistry {
  version: number
  students: PersonEntry[]
  teachers: TeacherEntry[]
  oldToNewSlug: Record<string, string>
}

// ============================================================
// 拼音首字母查找
// ============================================================

import { registry } from '@/data/person-registry'

const _initialsMap = new Map<string, string>()
for (const e of registry.students) _initialsMap.set(e.name, e.initials)
for (const e of registry.teachers) _initialsMap.set(e.name, e.initials)

/** 从 person-registry 查找姓名对应的拼音首字母缩写 */
export function getPinyinInitials(name: string): string {
  return _initialsMap.get(name) ?? ''
}

// ============================================================
// 解析结果
// ============================================================

export interface ResolveResult {
  /** 显示文本（缩写） */
  displayText: string
  /** 链接目标 URL */
  href: string
  /** 匹配到的条目（per 类型时为 null） */
  entry: PersonEntry | TeacherEntry | null
}

/**
 * 解析人名引用
 * @param input xxx 部分（如 "wz", "jrq", "jiang-rq"）
 * @param type stu / usr / tch / per
 * @param registry 注册表
 * @returns 解析结果
 * @throws 歧义或未找到时抛异常
 */
export function resolvePerson(
  input: string,
  type: string,
  registry: PersonRegistry,
): ResolveResult {
  // [per:xxx] — 透传，直接显示 xxx
  if (type === 'per') {
    return { displayText: input, href: '', entry: null }
  }

  const isTeacher = type === 'tch'
  const entries = isTeacher ? registry.teachers : registry.students
  const basePath = typeof process !== 'undefined'
    ? (process.env.NEXT_PUBLIC_BASE_PATH || '')
    : ''

  // 辅助：尝试唯一匹配
  function uniqueMatch(matched: (PersonEntry | TeacherEntry)[]): ResolveResult {
    if (matched.length === 0) {
      throw new Error(`未找到${isTeacher ? '教师' : '学生'}：${input}`)
    }
    if (matched.length > 1) {
      const names = matched.map(e => e.name).join('、')
      throw new Error(`人名引用 "${input}" 不唯一，匹配到：${names}`)
    }
    const entry = matched[0]
    const displayText = entry.initials
    const href = isTeacher
      ? `${basePath}/wiki/people/teachers#${entry.initials}`
      : `${basePath}/wiki/${(entry as PersonEntry).newSlug}`
    return { displayText, href, entry }
  }

  // ----- 1. 首字母匹配 -----
  if (input.length === 1) {
    const matched = entries.filter(e => e.initials[0] === input)
    if (matched.length >= 1) return uniqueMatch(matched)
    // 不匹配则继续走后面的规则
  }

  // ----- 2. 全拼音前缀匹配 [stu:jiang] -----
  const prefixMatched = entries.filter(e => e.pinyinPrefix === input)
  if (prefixMatched.length >= 1) return uniqueMatch(prefixMatched)

  // ----- 3. 拼音缩写匹配 [stu:jrq] -----
  const initialsMatched = entries.filter(e => e.initials === input)
  if (initialsMatched.length >= 1) return uniqueMatch(initialsMatched)

  // ----- 4. 连字符格式匹配 [stu:jiang-rq] -----
  const hyphenMatched = entries.filter(e => e.hyphenForm === input)
  if (hyphenMatched.length >= 1) return uniqueMatch(hyphenMatched)

  // ----- 兜底：尝试 oldSlug 尾段匹配（仅学生，教师无独立页面）-----
  if (!isTeacher) {
    const slugTailMatched = (entries as PersonEntry[]).filter(e => {
      const tail = e.oldSlug.split('/').pop()
      return tail === input
    })
    if (slugTailMatched.length >= 1) return uniqueMatch(slugTailMatched)
  }

  throw new Error(`未找到${isTeacher ? '教师' : '学生'}：${input}`)
}

// ============================================================
// 纯文本替换 — 用于导航标题等非 markdown 路径
// ============================================================

/**
 * 替换文本中所有 [stu:xxx] / [usr:xxx] / [tch:xxx] / [per:xxx]
 * 为对应的显示文本（纯文本，无 HTML 标签）
 */
export function resolveText(text: string, registry: PersonRegistry): string {
  return text.replace(
    /\[(stu|usr|tch|per):([^\]]+)\]/g,
    (_match, type, input) => {
      try {
        const resolved = resolvePerson(input.trim(), type.toLowerCase(), registry)
        return resolved.displayText
      } catch {
        return _match // 解析失败则保留原样
      }
    },
  )
}
