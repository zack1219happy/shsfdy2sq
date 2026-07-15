// ============================================================
// 服务端专用：加载人物注册表
// 从 generate-person-ts.js 生成的 TypeScript 文件读取（该脚本从 DB 获取数据）
// ============================================================

import { registry as generatedRegistry } from '@/data/person-registry'
import type { PersonRegistry } from './people'

let cachedRegistry: PersonRegistry | null = null

export function loadRegistry(): PersonRegistry {
  if (cachedRegistry) return cachedRegistry
  cachedRegistry = generatedRegistry as unknown as PersonRegistry
  return cachedRegistry
}
