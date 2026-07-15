/**
 * diff.ts — 行级别 diff 实现
 *
 * 基于 LCS（最长公共子序列），用于 wiki 审核页面的 diff 展示。
 */

export interface DiffLine {
  type: 'add' | 'del' | 'same'
  value: string
  oldLine?: number
  newLine?: number
}

/** 分割文本为行，统一处理尾随换行 */
function splitLines(text: string): string[] {
  // 移除末尾换行以免产生多余的空串行
  const trimmed = text.replace(/\n$/, '')
  return trimmed.split('\n')
}

/**
 * 对两段文本做行级别 diff
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  const m = oldLines.length
  const n = newLines.length

  // 只有一个方向为空时直接返回全部增减
  if (m === 0 && n === 0) return []
  if (m === 0) return newLines.map((v, i) => ({ type: 'add' as const, value: v, newLine: i + 1 }))
  if (n === 0) return oldLines.map((v, i) => ({ type: 'del' as const, value: v, oldLine: i + 1 }))

  // 构建 LCS 表
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // 回溯
  const result: DiffLine[] = []
  let i = m, j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', value: oldLines[i - 1], oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', value: newLines[j - 1], newLine: j })
      j--
    } else {
      result.unshift({ type: 'del', value: oldLines[i - 1], oldLine: i })
      i--
    }
  }

  return result
}
