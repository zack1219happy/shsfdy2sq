/**
 * 运势抽卡 — 核心逻辑
 *
 * 起卦：hash(date + studentId) % 64
 * 领域：按日期判断考试日 / 放假 / 周末 / 在校
 *
 * 所有结果（卦象 + 宜忌）完全由 date + studentId 决定，
 * 同一天同一个人永远得到完全相同的结果。
 */
import { getHexagram, type Hexagram } from '@/data/hexagrams'
import { domainLabels, pickAdvice, type FortuneDomain, type AdviceItem } from '@/data/fortune-advice'

/** 简单的字符串 hash（DJBA2） */
function hashStr(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(hash)
}

/**
 * 简易线性同余生成器（LCG）
 * 用 seed 初始化，每次 next() 返回 [0, 1) 的伪随机数
 */
function createSeededRandom(seed: number) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return {
    next(): number {
      state = (state * 16807) % 2147483647
      return (state - 1) / 2147483646
    },
  }
}

/** 格式化为 YYYY-MM-DD（本地时间） */
export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── 考试/假日日期，从数据库加载 ──
// 格式 { start: "MM-DD", end?: "MM-DD" }
interface FortuneDateEntry {
  type: 'exam' | 'holiday'
  start: string
  end?: string
}

let fortuneDates: FortuneDateEntry[] = []

let dbLoaded = false

/**
 * 从 Supabase 加载考试/假日日期，覆盖硬编码默认值
 */
export async function loadFortuneDatesFromDB(): Promise<void> {
  if (dbLoaded) return
  try {
    const { supabase } = await import('@/lib/supabase')
    const { data, error } = await supabase.rpc('get_fortune_dates', { p_type: null })
    if (error) {
      console.warn('加载考试/假日日期失败:', error.message)
      return
    }
    fortuneDates = (data ?? []).map((r: any) => ({
      type: r.date_type as 'exam' | 'holiday',
      start: r.start_date ? String(r.start_date).slice(5) : '',
      end: r.end_date ? String(r.end_date).slice(5) : undefined,
    }))
    dbLoaded = true
  } catch (e) {
    console.warn('加载考试/假日日期异常:', e)
  }
}

/**
 * 判断今天的领域（完全由数据库日期决定，无硬编码 fallback）
 */
export function getTodayDomain(): FortuneDomain {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 1. 考试日优先
  for (const d of fortuneDates) {
    if (d.type === 'exam' && d.start === mmdd) return 'exam'
  }

  // 2. 放假（含跨年范围）
  for (const d of fortuneDates) {
    if (d.type !== 'holiday') continue
    if (d.end && d.start <= d.end) {
      if (mmdd >= d.start && mmdd <= d.end) return 'holiday'
    } else if (d.end) {
      // 跨年：如 12-25 ~ 01-05
      if (mmdd >= d.start || mmdd <= d.end) return 'holiday'
    }
  }

  // 3. 周末
  const dayOfWeek = now.getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return 'weekend'

  // 4. 在校
  return 'school'
}

export interface FortuneResult {
  hexagram: Hexagram
  domain: FortuneDomain
  domainLabel: string
  adviceYi: AdviceItem[]
  adviceJi: AdviceItem[]
  /** 大吉时为 true，显示"诸事皆宜" */
  allGood: boolean
  /** 大凶时为 true，显示"诸事不宜" */
  allBad: boolean
}

/**
 * 抽卡 — 用 studentId 起卦，所有结果完全确定性
 */
export function drawFortune(studentId: string): FortuneResult {
  const dateKey = todayStr()
  const seed = hashStr(dateKey + studentId)
  const rng = createSeededRandom(seed)

  // 卦象
  const hexIndex = (seed % 64) + 1
  const hexagram = getHexagram(hexIndex)

  // 领域
  const domain = getTodayDomain()

  // 按吉凶等级决定宜/忌数量
  const levelMap: Record<string, [number, number]> = {
    '大吉': [3, 0],
    '吉': [3, 1],
    '小吉': [2, 1],
    '平': [2, 2],
    '小凶': [1, 2],
    '凶': [1, 3],
    '大凶': [0, 3],
  }
  const [yiCount, jiCount] = levelMap[hexagram.level] || [2, 2]

  // 宜/忌 — 用同一个 seed 但不同偏移保证不重复
  const rngYi = createSeededRandom(seed + 1)
  const rngJi = createSeededRandom(seed + 2)

  return {
    hexagram,
    domain,
    domainLabel: domainLabels[domain],
    adviceYi: pickAdvice(domain, '宜', yiCount, rngYi.next),
    adviceJi: pickAdvice(domain, '忌', jiCount, rngJi.next),
    allGood: jiCount === 0,
    allBad: yiCount === 0,
  }
}

