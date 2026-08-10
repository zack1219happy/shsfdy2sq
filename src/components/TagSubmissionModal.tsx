'use client'

import { useCallback, useState } from 'react'
import { submitTagSubmission } from '@/lib/gist-api'
import forumStyles from '@/styles/forum.module.css'

/**
 * TagSubmissionModal — 标签投稿弹窗
 *
 * 用户输入标签文字（≤7 字，中文算 1）、价格、颜色后提交，进入待审核。
 * 颜色不做 CSS 配置器，提供外链 https://cssgradient.io/ 引导生成。
 */
export default function TagSubmissionModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('')
  const [price, setPrice] = useState('')
  const [tagColor, setTagColor] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const handleSubmit = useCallback(async () => {
    setError(null)
    const trimmed = value.trim()
    if (!trimmed) {
      setError('请输入标签文字')
      return
    }
    // 中文算 1 个字符，直接统计字符数即可（≤7）
    if (Array.from(trimmed).length > 7) {
      setError('标签最多 7 个字')
      return
    }
    const priceNum = Number(price)
    if (!priceNum || priceNum <= 0 || !Number.isInteger(priceNum)) {
      setError('请输入正整数价格')
      return
    }
    setSubmitting(true)
    try {
      const res = await submitTagSubmission(trimmed, tagColor.trim() || null, priceNum)
      if (!res.success) {
        setError(res.message)
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败')
      setSubmitting(false)
    }
  }, [value, price, tagColor])

  return (
    <div className={forumStyles.modalOverlay} onClick={() => { if (!submitting && !done) onClose() }}>
      <div
        className={forumStyles.visibilityModal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440 }}
      >
        <div className={forumStyles.visibilityModalHeader}>
          <h3>没有想要的标签？投稿一个！</h3>
          <button
            type="button"
            className={forumStyles.visibilityModalClose}
            onClick={onClose}
            disabled={submitting}
            style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-light)' }}
          >
            ✕
          </button>
        </div>

        {done ? (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>🎉 投稿成功</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              已进入待审核，审核通过后就能在商城购买了。
            </p>
            <button
              className={`${forumStyles.btn} ${forumStyles.btnPrimary}`}
              style={{ marginTop: 16 }}
              onClick={onClose}
            >
              完成
            </button>
          </div>
        ) : (
          <div style={{ padding: '8px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 标签文字 */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                标签文字（最多 7 个字）
              </label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="例如：常年睡不醒"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '0.9rem',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
            </div>

            {/* 价格 */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                价格（积分）
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="例如：200"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: '0.9rem',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
            </div>

            {/* 颜色 */}
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                颜色（可选）
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  placeholder="颜色值，如 #ff69b4 或渐变"
                  style={{
                    flex: 1,
                    boxSizing: 'border-box',
                    padding: '8px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: '0.9rem',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    outline: 'none',
                  }}
                />
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid var(--color-border)',
                    background: tagColor.trim() && tagColor.trim().startsWith('#') ? tagColor.trim() : tagColor.trim() || '#eee',
                    flexShrink: 0,
                  }}
                />
              </div>
              <a
                href="https://cssgradient.io/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 6, fontSize: '0.8rem', color: 'var(--color-primary)' }}
              >
                用 cssgradient.io 生成渐变色 →
              </a>
            </div>

            {error && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#dc2626' }}>❌ {error}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className={`${forumStyles.btn} ${forumStyles.btnOutline}`} onClick={onClose} disabled={submitting}>
                取消
              </button>
              <button className={`${forumStyles.btn} ${forumStyles.btnPrimary}`} onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中…' : '提交审核'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
