/* ============================================
   人名注册表 —— 运行时刷新

   构建期会把 get_person_registry 的结果烘进 src/data/person-registry.ts。
   但注册表是数据库里的活数据（加老师、改缩写），快照一旦过期，
   [tch:qwl] 这类人名引用就会退化成原文，要等下次部署才恢复。

   这里在客户端首次用到时拉一次 get_person_registry，
   把最新注册表交给渲染层，并与 [[...]] 的标题解析保持一致。
   ============================================ */

'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { registry as bakedRegistry } from '@/data/person-registry'
import type { PersonRegistry } from './people'
import { supabase } from './supabase'

let cached: PersonRegistry | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PersonRegistry | null {
  return cached
}

/** 服务端渲染 / 初次 hydration 用构建期快照，避免水合不一致 */
function getServerSnapshot(): PersonRegistry | null {
  return null
}

function isValidRegistry(value: unknown): value is PersonRegistry {
  if (!value || typeof value !== 'object') return false
  const registry = value as Partial<PersonRegistry>
  // 空注册表多半是查询出错，宁可用快照也不要把所有人名引用打回原文
  return Array.isArray(registry.students) && registry.students.length > 0 && Array.isArray(registry.teachers)
}

/** 当前生效的注册表：运行时数据优先，没拉到时用构建期快照 */
export function getPersonRegistry(): PersonRegistry {
  return cached ?? bakedRegistry
}

function fetchIntoCache(): Promise<void> {
  return (async () => {
    if (cached) return
    try {
      const { data, error } = await supabase.rpc('get_person_registry')
      if (error || !isValidRegistry(data)) return
      const next: PersonRegistry = {
        version: Number(data.version) || 0,
        students: data.students,
        teachers: data.teachers,
        oldToNewSlug:
          data.oldToNewSlug && typeof data.oldToNewSlug === 'object' ? data.oldToNewSlug : {},
      }
      cached = next
      for (const listener of [...listeners]) listener()
    } catch {
      // 网络失败：继续用构建期快照，下次挂载再试
    }
  })()
}

/** 拉取最新注册表（并发调用共享同一个请求），返回拉取后的生效注册表 */
export function loadPersonRegistry(): Promise<PersonRegistry> {
  if (!cached && !inflight) {
    inflight = fetchIntoCache().finally(() => {
      inflight = null
    })
  }
  return (inflight ?? Promise.resolve()).then(() => getPersonRegistry())
}

/** 组件里用这个：拿到最新注册表，拉取成功后自动重渲染 */
export function usePersonRegistry(): PersonRegistry {
  const fresh = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    void loadPersonRegistry()
  }, [])

  return fresh ?? bakedRegistry
}
