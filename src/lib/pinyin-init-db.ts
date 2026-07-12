/**
 * 拼音首字母 — 数据库驱动的查找模块
 *
 * 在客户端初始化时从 Supabase 加载所有 initials 到内存 Map，
 * 之后 getPinyinInitials 保持同步调用。
 */

import { supabase } from './supabase'

// ----- DB 缓存 ------

let dbLoaded = false
let dbLoading = false
const dbMap = new Map<string, string>()

/**
 * 从 Supabase 加载所有拼音首字母到内存缓存
 * 可在应用初始化时调用，或按需调用
 */
export async function loadPinyinInitialsFromDB(): Promise<void> {
  if (dbLoaded || dbLoading) return
  dbLoading = true
  try {
    const { data, error } = await supabase.rpc('get_all_pinyin_initials')
    if (error) {
      console.warn('从数据库加载拼音首字母失败:', error.message)
      return
    }
    if (data) {
      dbMap.clear()
      for (const row of data) dbMap.set(row.name, row.initials)
      dbLoaded = true
    }
  } catch (e) {
    console.warn('从数据库加载拼音首字母异常:', e)
  } finally {
    dbLoading = false
  }
}

/** 同步获取拼音首字母，仅从 DB 缓存查找 */
export function getPinyinInitials(name: string): string {
  return dbMap.get(name) ?? ''
}
