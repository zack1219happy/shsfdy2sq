'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { fetchUserPurchases, equipColor, equipTags, fetchUserEquipped } from '@/lib/gist-api'
import type { UserPurchase } from '@/types/gist'
import { BUILTIN_TAGS, CUSTOM_TAG_VALUE } from '@/types/gist'
import styles from '@/styles/points.module.css'

type PageState = 'loading' | 'ready' | 'error'

export default function AppearancePage() {
  const router = useRouter()
  const [session, setSession] = useState(getSession())
  const [pageState, setPageState] = useState<PageState>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // 已购买的商品
  const [purchases, setPurchases] = useState<UserPurchase[]>([])

  // 当前装备
  const [currentColor, setCurrentColor] = useState<string | null>(null)
  const [currentColorId, setCurrentColorId] = useState<string | null>(null)
  const [currentTags, setCurrentTags] = useState<string[]>([])

  // 自定义 tag 输入
  const [customTagText, setCustomTagText] = useState('')
  const [editingCustomTag, setEditingCustomTag] = useState(false)

  // 操作状态
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!session) { router.push('/'); return }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadData = useCallback(async () => {
    setPageState('loading')
    setErrorMsg('')
    try {
      const [purchasesData, equipped] = await Promise.all([
        fetchUserPurchases(),
        fetchUserEquipped(),
      ])
      setPurchases(purchasesData)
      setCurrentColor(equipped.color)
      setCurrentTags(equipped.tags)

      // 找出当前颜色对应的 item_id
      if (equipped.color) {
        const colorItem = purchasesData.find(
          p => p.item_type === 'color' && p.value === equipped.color
        )
        if (colorItem) setCurrentColorId(colorItem.item_id)
      }

      // 如果当前装备了自定义 tag（不在已购 tag 列表中的短文本即为自定义），回填输入框
      const customTag = equipped.tags.find(t => t.length <= 5 && !purchasesData.some(p => p.item_type === 'tag' && p.value === t))
      if (customTag) setCustomTagText(customTag)

      setPageState('ready')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '加载失败')
      setPageState('error')
    }
  }, [])

  // 已购颜色
  const ownedColors = purchases.filter(p => p.item_type === 'color')
  // 已购标签（排除自定义 item）
  const ownedTags = purchases.filter(p => p.item_type === 'tag' && p.value !== CUSTOM_TAG_VALUE)
  const customTagPurchase = purchases.find(p => p.item_type === 'tag' && p.value === CUSTOM_TAG_VALUE)
  const isCustomEquipped = customTagText.trim().length > 0 && currentTags.includes(customTagText.trim())

  // 当前用户名（从 session）
  const username = session?.username ?? ''
  const builtinTags = BUILTIN_TAGS[username] ?? []

  // 总共可显示的 tags = 内置 + 已装备（最多 3 个用户 tag）
  const displayTags = [...builtinTags, ...currentTags]

  // 处理颜色选择
  const handleColorSelect = useCallback(async (itemId: string, colorValue: string) => {
    if (saving) return
    setSaving(true)

    // 如果点击的是当前已选中的颜色，则卸装
    const newId = itemId === currentColorId ? null : itemId
    const newColor = itemId === currentColorId ? null : colorValue

    // 乐观更新
    setCurrentColorId(newId)
    setCurrentColor(newColor)

    try {
      const result = await equipColor(newId)
      if (!result.success) {
        // 回退
        setCurrentColorId(currentColorId)
        setCurrentColor(currentColor)
      }
    } catch {
      setCurrentColorId(currentColorId)
      setCurrentColor(currentColor)
    } finally {
      setSaving(false)
    }
  }, [saving, currentColorId, currentColor])

  // 处理标签切换
  const handleTagToggle = useCallback(async (tagValue: string) => {
    if (saving) return
    setSaving(true)

    let newTags: string[]
    if (currentTags.includes(tagValue)) {
      newTags = currentTags.filter(t => t !== tagValue)
    } else {
      if (currentTags.length >= 3) {
        setSaving(false)
        return
      }
      newTags = [...currentTags, tagValue]
    }

    // 乐观更新
    setCurrentTags(newTags)

    try {
      const result = await equipTags(newTags)
      if (!result.success) {
        setCurrentTags(currentTags)
      }
    } catch {
      setCurrentTags(currentTags)
    } finally {
      setSaving(false)
    }
  }, [saving, currentTags])

  // 自定义 tag — 单击切换装备
  const handleCustomTagToggle = useCallback(async () => {
    if (saving) return
    const trimmed = customTagText.trim()
    if (!trimmed) { setEditingCustomTag(true); return }

    setSaving(true)
    let newTags: string[]
    if (currentTags.includes(trimmed)) {
      newTags = currentTags.filter(t => t !== trimmed)
    } else {
      if (currentTags.length >= 3) { setSaving(false); return }
      newTags = [...currentTags, trimmed]
    }
    setCurrentTags(newTags)
    try {
      const r = await equipTags(newTags)
      if (!r.success) setCurrentTags(currentTags)
    } catch { setCurrentTags(currentTags) }
    finally { setSaving(false) }
  }, [saving, customTagText, currentTags])

  // 自定义 tag — 双击编辑
  const handleCustomTagStartEdit = useCallback(() => {
    setEditingCustomTag(true)
  }, [])

  // 自定义 tag — 编辑器失焦 / Enter 时保存
  const handleCustomTagSave = useCallback(async () => {
    const trimmed = customTagText.trim()
    setEditingCustomTag(false)
    if (!trimmed || trimmed.length > 5) return

    // 替换旧自定义 tag 值
    const otherTags = currentTags.filter(t => t !== currentTags.find(ct => !ownedTags.some(ot => ot.value === ct) && !BUILTIN_TAGS[session?.username ?? '']?.includes(ct)))
    const newTags = otherTags.includes(trimmed) ? otherTags : [...otherTags, trimmed]
    if (newTags.length > 3) return
    setSaving(true)
    setCurrentTags(newTags)
    try {
      const r = await equipTags(newTags)
      if (!r.success) setCurrentTags(currentTags)
    } catch { setCurrentTags(currentTags) }
    finally { setSaving(false) }
  }, [customTagText, currentTags, ownedTags, session])

  if (!session) return null

  if (pageState === 'loading') {
    return (
      <div className={styles.appearancePage}>
        <h2 className={styles.appearanceTitle}><FaIcon name="palette" /> 名称装扮</h2>
        <div className={styles.status}><FaIcon name="spinner" spin /> 加载中…</div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className={styles.appearancePage}>
        <h2 className={styles.appearanceTitle}><FaIcon name="palette" /> 名称装扮</h2>
        <div className={styles.statusError}>
          <p>{errorMsg}</p>
          <button className={styles.pageBtn} onClick={loadData}>重试</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.appearancePage}>
      <h2 className={styles.appearanceTitle}>
        <FaIcon name="palette" /> 名称装扮
      </h2>

      {/* 预览区 */}
      <div className={styles.appearancePreview}>
        <div className={styles.appearancePreviewLabel}>当前效果预览</div>
        <div className={styles.appearancePreviewName}>
          <DecoratedName
            username={username}
            color={currentColor}
            tags={displayTags}
          />
        </div>
      </div>

      {/* 颜色选择 */}
      <section className={styles.appearanceSection}>
        <h3 className={styles.appearanceSectionTitle}>
          <FaIcon name="palette" /> 颜色（已拥有 {ownedColors.length} 个）
        </h3>
        {ownedColors.length === 0 ? (
          <div className={styles.appearanceEmpty}>
            还没有颜色哦，<Link href="/user/shop" className={styles.appearanceEmptyLink}>去商城看看</Link>
          </div>
        ) : (
          <div className={styles.appearanceGrid}>
            {ownedColors.map(item => {
              const isActive = item.item_id === currentColorId
              const isGradient = item.value.startsWith('linear-gradient(')
              return (
                <div
                  key={item.item_id}
                  className={`${styles.appearanceColorItem} ${isActive ? styles.appearanceColorItemActive : ''}`}
                  style={{
                    background: item.value,
                    ...(isGradient ? {} : { backgroundColor: item.value }),
                  }}
                  onClick={() => handleColorSelect(item.item_id, item.value)}
                  title={item.name}
                >
                  {isActive && (
                    <span className={styles.appearanceColorCheck}>
                      <FaIcon name="check" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* 标签选择 */}
      <section className={styles.appearanceSection}>
        <h3 className={styles.appearanceSectionTitle}>
          <FaIcon name="star" /> 标签（最多 3 个，已选 {currentTags.length}/3）
        </h3>
        {builtinTags.length === 0 && ownedTags.length === 0 && !customTagPurchase ? (
          <div className={styles.appearanceEmpty}>
            还没有标签哦，<Link href="/user/shop" className={styles.appearanceEmptyLink}>去商城看看</Link>
          </div>
        ) : (
          <div className={styles.appearanceGrid}>
            {/* 内置身份 tag（只读、始终激活、不占槽位） */}
            {builtinTags.map((tag, i) => (
              <span
                key={`builtin-${i}`}
                className={`${styles.appearanceTagItem} ${styles.appearanceTagItemActive}`}
                style={{ opacity: 0.8, cursor: 'default' }}
                title="内置身份标签，不可卸装"
              >
                {tag} ✓
              </span>
            ))}

            {/* 已购标签 */}
            {ownedTags.map(item => {
              const isActive = currentTags.includes(item.value)
              const atLimit = !isActive && currentTags.length >= 3
              return (
                <span
                  key={item.item_id}
                  className={`${styles.appearanceTagItem} ${isActive ? styles.appearanceTagItemActive : ''} ${atLimit ? styles.appearanceTagItemDisabled : ''}`}
                  style={item.tag_color ? { borderColor: isActive ? item.tag_color : undefined, color: isActive ? item.tag_color : undefined } : undefined}
                  onClick={() => !atLimit && handleTagToggle(item.value)}
                >
                  {item.name}
                  {isActive && ' ✓'}
                </span>
              )
            })}

            {/* 自定义 tag（单击切换，双击编辑文字） */}
            {customTagPurchase && (
              editingCustomTag ? (
                <input
                  className={styles.appearanceCustomInlineInput}
                  type="text"
                  placeholder="输入文字(≤5字)"
                  maxLength={5}
                  value={customTagText}
                  autoFocus
                  onChange={e => setCustomTagText(e.target.value)}
                  onBlur={handleCustomTagSave}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
              ) : (
                <span
                  className={`${styles.appearanceTagItem} ${isCustomEquipped ? styles.appearanceTagItemActive : ''}`}
                  style={{ borderColor: isCustomEquipped ? '#9ca3af' : undefined, color: isCustomEquipped ? '#9ca3af' : undefined }}
                  onClick={handleCustomTagToggle}
                  onDoubleClick={handleCustomTagStartEdit}
                  title="双击编辑文字"
                >
                  {customTagText || '自定义灰色'}
                  {isCustomEquipped && ' ✓'}
                </span>
              )
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/* ==============================================================
   DecoratedName — 带颜色和标签的用户名预览
   ============================================================== */

function DecoratedName({
  username,
  color,
  tags,
}: {
  username: string
  color: string | null
  tags: string[]
}) {
  const nameEl = color ? (
    color.startsWith('linear-gradient(') ? (
      <span style={{
        background: color,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'inline-block',
      }}>
        {username}
      </span>
    ) : (
      <span style={{ color }}>{username}</span>
    )
  ) : (
    <span>{username}</span>
  )

  return (
    <>
      {nameEl}
      {tags.map((tag, i) => (
        <span key={i} className={styles.previewTag} style={getPreviewTagStyle(tag)}>
          {tag}
        </span>
      ))}
    </>
  )
}

/** 预览区标签特殊样式 */
function getPreviewTagStyle(text: string): CSSProperties {
  if (text === '创始人') return { background: '#000', color: '#fff' }
  if (text === '工程师') return { background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff' }
  return {}
}
