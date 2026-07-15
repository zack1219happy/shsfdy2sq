/**
 * diff.ts — 简单的行级别 diff 实现
 *
 * 基于 LCS (最长公共子序列) 算法，用于 wiki 审核页面的 diff 展示。
 */

export interface DiffLine {
  type: 'add' | 'del' | 'same'
  value: string
  oldLine?: number
  newLine?: number
}

/**
 * 对两段文本做行级别 diff
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // 构建 LCS 表
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯 LCS
  const result: DiffLine[] = []
  let i = m, j = n
  const temp: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'same', value: oldLines[i - 1], oldLine: i, newLine: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: 'add', value: newLines[j - 1], newLine: j })
      j--
    } else {
      temp.push({ type: 'del', value: oldLines[i - 1], oldLine: i })
      i--
    }
  }

  // 反转
  for (let k = temp.length - 1; k >= 0; k--) {
    result.push(temp[k])
  }

  return result
}
