/**
 * 六十四卦数据（文王卦序）
 *
 * 吉凶等级：大吉 | 吉 | 小吉 | 平 | 小凶 | 凶 | 大凶
 */
export interface Hexagram {
  /** 序号 1-64 */
  index: number
  /** 卦名 */
  name: string
  /** 卦符（Unicode） */
  symbol: string
  /** 吉凶等级 */
  level: '大吉' | '吉' | '小吉' | '平' | '小凶' | '凶' | '大凶'
}

export const hexagrams: Hexagram[] = [
  { index: 1,  name: '乾为天', symbol: '䷀', level: '大吉' },
  { index: 2,  name: '坤为地', symbol: '䷁', level: '大吉' },
  { index: 3,  name: '水雷屯', symbol: '䷂', level: '平' },
  { index: 4,  name: '山水蒙', symbol: '䷃', level: '小凶' },
  { index: 5,  name: '水天需', symbol: '䷄', level: '平' },
  { index: 6,  name: '天水讼', symbol: '䷅', level: '凶' },
  { index: 7,  name: '地水师', symbol: '䷆', level: '小凶' },
  { index: 8,  name: '水地比', symbol: '䷇', level: '吉' },
  { index: 9,  name: '风天小畜', symbol: '䷈', level: '小吉' },
  { index: 10, name: '天泽履', symbol: '䷉', level: '平' },
  { index: 11, name: '地天泰', symbol: '䷊', level: '大吉' },
  { index: 12, name: '天地否', symbol: '䷋', level: '大凶' },
  { index: 13, name: '天火同人', symbol: '䷌', level: '吉' },
  { index: 14, name: '火天大有', symbol: '䷍', level: '大吉' },
  { index: 15, name: '地山谦', symbol: '䷎', level: '吉' },
  { index: 16, name: '雷地豫', symbol: '䷏', level: '小吉' },
  { index: 17, name: '泽雷随', symbol: '䷐', level: '吉' },
  { index: 18, name: '山风蛊', symbol: '䷑', level: '平' },
  { index: 19, name: '地泽临', symbol: '䷒', level: '吉' },
  { index: 20, name: '风地观', symbol: '䷓', level: '小吉' },
  { index: 21, name: '火雷噬嗑', symbol: '䷔', level: '平' },
  { index: 22, name: '山火贲', symbol: '䷕', level: '小吉' },
  { index: 23, name: '山地剥', symbol: '䷖', level: '大凶' },
  { index: 24, name: '地雷复', symbol: '䷗', level: '大吉' },
  { index: 25, name: '天雷无妄', symbol: '䷘', level: '吉' },
  { index: 26, name: '山天大畜', symbol: '䷙', level: '吉' },
  { index: 27, name: '山雷颐', symbol: '䷚', level: '小吉' },
  { index: 28, name: '泽风大过', symbol: '䷛', level: '小凶' },
  { index: 29, name: '坎为水', symbol: '䷜', level: '凶' },
  { index: 30, name: '离为火', symbol: '䷝', level: '吉' },
  { index: 31, name: '泽山咸', symbol: '䷞', level: '吉' },
  { index: 32, name: '雷风恒', symbol: '䷟', level: '小吉' },
  { index: 33, name: '天山遁', symbol: '䷠', level: '平' },
  { index: 34, name: '雷天大壮', symbol: '䷡', level: '小吉' },
  { index: 35, name: '火地晋', symbol: '䷢', level: '吉' },
  { index: 36, name: '地火明夷', symbol: '䷣', level: '小凶' },
  { index: 37, name: '风火家人', symbol: '䷤', level: '吉' },
  { index: 38, name: '火泽睽', symbol: '䷥', level: '平' },
  { index: 39, name: '水山蹇', symbol: '䷦', level: '大凶' },
  { index: 40, name: '雷水解', symbol: '䷧', level: '吉' },
  { index: 41, name: '山泽损', symbol: '䷨', level: '平' },
  { index: 42, name: '风雷益', symbol: '䷩', level: '大吉' },
  { index: 43, name: '泽天夬', symbol: '䷪', level: '小吉' },
  { index: 44, name: '天风姤', symbol: '䷫', level: '平' },
  { index: 45, name: '泽地萃', symbol: '䷬', level: '吉' },
  { index: 46, name: '地风升', symbol: '䷭', level: '大吉' },
  { index: 47, name: '泽水困', symbol: '䷮', level: '大凶' },
  { index: 48, name: '水风井', symbol: '䷯', level: '吉' },
  { index: 49, name: '泽火革', symbol: '䷰', level: '小吉' },
  { index: 50, name: '火风鼎', symbol: '䷱', level: '大吉' },
  { index: 51, name: '震为雷', symbol: '䷲', level: '小吉' },
  { index: 52, name: '艮为山', symbol: '䷳', level: '平' },
  { index: 53, name: '风山渐', symbol: '䷴', level: '吉' },
  { index: 54, name: '雷泽归妹', symbol: '䷵', level: '平' },
  { index: 55, name: '雷火丰', symbol: '䷶', level: '吉' },
  { index: 56, name: '火山旅', symbol: '䷷', level: '小凶' },
  { index: 57, name: '巽为风', symbol: '䷸', level: '小吉' },
  { index: 58, name: '兑为泽', symbol: '䷹', level: '吉' },
  { index: 59, name: '风水涣', symbol: '䷺', level: '小吉' },
  { index: 60, name: '水泽节', symbol: '䷻', level: '吉' },
  { index: 61, name: '风泽中孚', symbol: '䷼', level: '吉' },
  { index: 62, name: '雷山小过', symbol: '䷽', level: '凶' },
  { index: 63, name: '水火既济', symbol: '䷾', level: '大吉' },
  { index: 64, name: '火水未济', symbol: '䷿', level: '平' },
]

/** 通过序号获取卦 */
export function getHexagram(index: number): Hexagram {
  return hexagrams[(index - 1 + 64) % 64]
}
