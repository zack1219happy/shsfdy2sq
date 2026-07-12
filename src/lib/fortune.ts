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

/** 格式化为 YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 判断今天是否在 [start, end] 日期范围内（含两端） */
function isBetween(startMMDD: string, endMMDD: string): boolean {
  const now = new Date()
  const y = now.getFullYear()
  const start = new Date(`${y}-${startMMDD}`)
  const end = new Date(`${y}-${endMMDD}`)
  // 处理跨年范围
  if (start <= end) {
    return now >= start && now <= end
  } else {
    return now >= start || now <= end
  }
}

// ── 考试日期列表，格式 "MM-DD" ──
// 由用户维护更新
let examDates: string[] = [
  '09-01', // 摸底考（2026-09-01）
]

// ── 放假日期范围 ──
const HOLIDAY_RANGES: [string, string][] = [
  ['07-01', '08-31'], // 暑假
]

/**
 * 判断今天的领域
 */
export function getTodayDomain(): FortuneDomain {
  const now = new Date()
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 1. 考试日优先
  if (examDates.includes(mmdd)) return 'exam'

  // 2. 放假
  for (const [start, end] of HOLIDAY_RANGES) {
    if (isBetween(start, end)) return 'holiday'
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

/** 设置考试日期（由用户调用维护） */
export function setExamDates(dates: string[]) {
  examDates = dates
}
