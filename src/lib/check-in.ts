/**
 * 打卡服务 — Supabase RPC 封装
 *
 * 每天第一次抽卡时记录打卡，同时累计积分。
 * 积分 = floor(sqrt(打卡后的连续天数))
 */
import { supabase } from './supabase'

export interface CheckInResult {
  streak: number
  total_points: number
}

/**
 * 打卡抽卡：记录今天的打卡，返回连续天数和总积分
 * 已打过卡则幂等返回当前数据
 */
export async function checkIn(studentId: string): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_student_id: studentId,
  })
  if (error) throw new Error('打卡失败: ' + error.message)
  const r = data as Record<string, unknown>
  return {
    streak: (r?.streak as number) ?? 0,
    total_points: (r?.total_points as number) ?? 0,
  }
}

/**
 * 查询用户总积分
 */
export async function getUserTotalPoints(studentId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_user_total_points', {
    p_student_id: studentId,
  })
  if (error) return 0
  return (data as number) ?? 0
}
