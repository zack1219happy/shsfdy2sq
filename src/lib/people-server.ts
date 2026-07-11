// ============================================================
// 服务端专用：从 JSON 文件加载注册表
// ============================================================

import fs from 'fs'
import path from 'path'
import type { PersonRegistry } from './people'

let cachedRegistry: PersonRegistry | null = null

export function loadRegistry(): PersonRegistry {
  if (cachedRegistry) return cachedRegistry
  const jsonPath = path.join(process.cwd(), 'data', 'person-registry.json')
  const raw = fs.readFileSync(jsonPath, 'utf-8')
  cachedRegistry = JSON.parse(raw) as PersonRegistry
  return cachedRegistry
}
