'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import type { UserSession } from '@/lib/auth'
import { markNotificationsReadForPage } from '@/lib/api/notifications'
import { fetchWishById, updateWishStatus } from '@/lib/api/wishes'
import type { WishItem } from '@/types/wishes'
import { WISH_STATUS_MAP, WISH_TIER_MAP } from '@/types/wishes'
import CommentSection from '@/components/CommentSection'
import WikiContent from '@/components/WikiContent'
import { UserName } from '@/components/UserName'
import { showWarningToast } from '@/lib/toast'
import { formatDate } from '@/lib/forum'
import { MODEL_OPTIONS } from '../new/_parts/constants'
import styles from '@/styles/forum.module.css'
import pd from '@/styles/post-detail.module.css'

/* ==============================================================
   许愿池详情页 — 查看需求详情、状态、评论
   风格对齐文章广场：灰色衬底 header + 无衬底详情 + 讨论
   ============================================================== */

const STATUS_OPTIONS = [
  { value: 'pending_review', label: '等待查看' },
  { value: 'working', label: '处理需求' },
  { value: 'developing', label: '开发实现' },
  { value: 'testing', label: '公测+bugfix' },
  { value: 'done', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
]

const MODEL_EMOJI: Record<string, string> = {
  ...Object.fromEntries(MODEL_OPTIONS.map((model) => [model.value, model.emoji])),
  flash: '🔵',
  'v4-pro': '🟣',
  'glm-5.2': '🟢',
  agens: '⚪',
}

const MODEL_LABEL: Record<string, string> = {
  ...Object.fromEntries(MODEL_OPTIONS.map((model) => [model.value, model.label])),
  flash: 'DeepSeek V4 Flash',
  'v4-pro': 'V4-Pro',
  'glm-5.2': 'GLM-5.2',
  agens: 'Agens',
}

export default function WishPostPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams.get('id') || ''

  const [wish, setWish] = useState<WishItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 记录最后一次完成加载的 id，用于推导 loading，避免在 effect 中同步 setState
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [session, setSession] = useState<UserSession | null>(null)

  const loading = loadedId !== id

  // 状态编辑（仅开发者）
  const [editingStatus, setEditingStatus] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [estimatedStage, setEstimatedStage] = useState('')
  const [submittingStatus, setSubmittingStatus] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const [w, s] = await Promise.all([fetchWishById(id), getSession()])
        if (cancelled) return
        setWish(w)
        setSession(s)
        void markNotificationsReadForPage(`wishes/${id}`)
          .then(() => window.dispatchEvent(new CustomEvent('new-notification')))
          .catch(() => {})
      } catch (e: unknown) {
        if (!cancelled) {
          setError((e as { message?: string } | null)?.message ?? null)
        }
      } finally {
        if (!cancelled) setLoadedId(id)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // 绑定 userId 而非用户名，也不依赖 role
  const isAdmin = session && (session.role === 'admin' || session.role === 'super_admin')

  const startEditStatus = () => {
    if (!wish) return
    setNewStatus(wish.status)
    setEstimatedHours(wish.estimated_hours || '')
    setEstimatedStage(wish.estimated_stage || '')
    setEditingStatus(true)
  }

  const submitStatus = async () => {
    if (!wish || !newStatus || submittingStatus) return
    setSubmittingStatus(true)
    try {
      await updateWishStatus(wish.id, newStatus, estimatedHours || undefined, estimatedStage || undefined)
      setWish((prev) => prev ? {
        ...prev,
        status: newStatus,
        estimated_hours: estimatedHours || null,
        estimated_stage: estimatedStage || null,
      } : null)
      setEditingStatus(false)
    } catch (e: unknown) {
      showWarningToast((e as { message?: string } | null)?.message || '更新失败')
    } finally {
      setSubmittingStatus(false)
    }
  }

  if (!id) return <div className={styles.page}><p className={styles.loading}>缺少需求标识</p></div>
  if (loading) return <div className={styles.page}><p className={styles.loading}>加载中…</p></div>
  if (error) return <div className={styles.page}><p className={styles.error}>❌ {error}</p></div>
  if (!wish) return <div className={styles.page}><p className={styles.error}>❌ 需求不存在</p></div>

  const tierLabel = WISH_TIER_MAP[wish.estimated_tier] || wish.estimated_tier
  const statusLabel = WISH_STATUS_MAP[wish.status] || wish.status

  const tierColors: Record<string, string> = {
    small: '#2ecc40',
    medium: '#f39c12',
    large: '#e74c3c',
  }
  const tierColor = tierColors[wish.estimated_tier] || '#888'

  return (
    <>
      {/* ── 灰色衬底 header（对齐文章广场 detailHeader） ── */}
      <div className={pd.detailHeader}>
        <div className={pd.detailHeaderInner}>
          <div className={pd.detailTitleRow}>
            <h1 className={pd.detailTitle}>
              #{String(wish.request_number).padStart(4, '0')}
            </h1>
            <div style={{ display: 'flex', gap: 4 }}>
              {isAdmin && !editingStatus && (
                <button className={pd.backBtnIcon} onClick={startEditStatus} title="编辑进度">
                  <FaIcon name="pen" />
                </button>
              )}
              <button className={pd.backBtnIcon} onClick={() => router.push('/wishes')} title="返回列表">
                <FaIcon name="chevron-left" />
              </button>
            </div>
          </div>
          <div className={pd.detailMeta}>
            {wish.author_username ? (
              <UserName username={wish.author_username} userId={wish.user_id} className={pd.detailAuthor} />
            ) : (
              <span className={pd.detailAuthor} style={{ color: 'var(--color-text-light)' }}>匿名</span>
            )}
            <span>提交于 {formatDate(wish.created_at)}</span>
          </div>
        </div>
      </div>

      {/* ── 无衬底详情 ── */}
      <div className={styles.page} style={{ paddingTop: 0 }}>
        <div className={pd.detail}>
          {/* 标签行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: '#fff',
              padding: '3px 10px', borderRadius: 'var(--border-radius)',
              background: tierColor,
            }}>
              {tierLabel}
            </span>
            <span style={{
              fontSize: '0.8rem', fontWeight: 600, color: '#fff',
              padding: '3px 10px', borderRadius: 'var(--border-radius)',
              background: wish.status === 'done' ? '#2ecc40' :
                         wish.status === 'cancelled' ? '#888' : 'var(--color-primary)',
            }}>
              {statusLabel}
            </span>
            {wish.extra_money > 0 && (
              <span style={{
                fontSize: '0.8rem', fontWeight: 600, color: '#dc2626',
                padding: '3px 10px', borderRadius: 'var(--border-radius)',
                background: '#fee2e2',
              }}>
                +¥{wish.extra_money}
              </span>
            )}
          </div>

          {/* 工时 & 信息 */}
          {(wish.estimated_hours || wish.estimated_stage) && (
            <div style={{
              marginBottom: 8, padding: '10px 14px',
              background: 'var(--color-active-bg)', borderRadius: 'var(--border-radius)',
              fontSize: '0.85rem', color: 'var(--color-text-secondary)',
              display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              {wish.estimated_hours && <span>⏱ 预计 {wish.estimated_hours} 工时</span>}
              {wish.estimated_stage && <span>📅 {wish.estimated_stage}</span>}
            </div>
          )}

          {/* 信息栏（仅管理员可见） */}
          {isAdmin && (
            <div style={{
              marginBottom: 8, display: 'flex', gap: '8px 24px', fontSize: '0.85rem',
              color: 'var(--color-text-muted)', flexWrap: 'wrap',
            }}>
              <span>{MODEL_EMOJI[wish.model_preference] || ''} {MODEL_LABEL[wish.model_preference] || wish.model_preference}</span>
              {wish.api_budget_cap != null && <span>预算上限：¥{wish.api_budget_cap}</span>}
              <span>联系方式：{wish.contact_type === 'dm' ? '站内私信' : wish.contact_type === 'wechat' ? '微信' : '手机'}</span>
              {wish.contact_detail && <span>详情：{wish.contact_detail}</span>}
            </div>
          )}

          {/* 描述 */}
          <div className={pd.detailBody} style={{ marginTop: 12 }}>
            <WikiContent content={wish.description} className="wiki-body" contextUserId={wish.user_id} />
          </div>

          {/* 管理员状态编辑 */}
          {editingStatus && (
            <div style={{
              marginBottom: 16, padding: '16px 20px',
              background: 'var(--color-sidebar-bg)', borderRadius: 'var(--border-radius)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <strong style={{ fontSize: '0.9rem' }}>编辑进度</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setNewStatus(s.value)}
                    style={{
                      padding: '6px 14px', border: `2px solid ${newStatus === s.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: 'var(--border-radius)', background: newStatus === s.value ? 'var(--color-active-bg)' : '#fff',
                      cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500,
                      color: newStatus === s.value ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  预计工时：
                  <input
                    type="text"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                    placeholder="如 3-5h"
                    style={{
                      marginLeft: 4, width: 100, padding: '6px 10px',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)',
                      fontSize: '0.85rem', fontFamily: 'inherit',
                    }}
                  />
                </label>
                <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                  预计完成：
                  <input
                    type="text"
                    value={estimatedStage}
                    onChange={(e) => setEstimatedStage(e.target.value)}
                    placeholder="如 7月下旬"
                    style={{
                      marginLeft: 4, width: 120, padding: '6px 10px',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)',
                      fontSize: '0.85rem', fontFamily: 'inherit',
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={submitStatus}
                  disabled={submittingStatus}
                  style={{
                    padding: '6px 20px', border: 'none', borderRadius: 'var(--border-radius)',
                    background: 'var(--color-primary)', color: '#fff', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 500, fontFamily: 'inherit',
                  }}
                >
                  {submittingStatus ? '保存中…' : '保存'}
                </button>
                <button
                  onClick={() => setEditingStatus(false)}
                  style={{
                    padding: '6px 20px', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)',
                    background: '#fff', color: 'var(--color-text-secondary)', cursor: 'pointer',
                    fontSize: '0.85rem', fontFamily: 'inherit',
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 分割线 → 讨论 */}
          <div className={pd.voteBar} style={{ borderBottom: '1px solid var(--color-border)', padding: '0 0 0' }} />

          <CommentSection source="wish" targetId={wish.id} title="讨论" />
        </div>
      </div>
    </>
  )
}
