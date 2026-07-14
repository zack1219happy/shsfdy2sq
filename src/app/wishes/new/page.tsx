'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { BASE_PATH } from '@/lib/constants'
import type { UserSession } from '@/lib/auth'
import styles from '@/styles/wishes.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/* ==============================================================
   许愿池 — 单页表单 + 扫码付款流程
   ============================================================== */

// ── 模型选项 ──
const MODEL_OPTIONS = [
  {
    value: 'flash',
    label: 'DeepSeek V4 Flash',
    emoji: '🔵',
    desc: '默认，大多数需求够了，成本最低',
    costNote: null,
  },
  {
    value: 'v4-pro',
    label: 'V4-Pro',
    emoji: '🟣',
    desc: '推理更强，成本 ×2',
    costNote: null,
  },
  {
    value: 'glm-5.2',
    label: 'GLM-5.2',
    emoji: '🟢',
    desc: '前端做得最好看，成本 ×10',
    costNote: '⚠️ API 成本可能飙到几十块，建议设预算上限',
  },
  {
    value: 'agens',
    label: 'Agens',
    emoji: '⚪',
    desc: '几乎免费，但效率很低，不急再选',
    costNote: '⏳ 预计交付时间会显著延长',
  },
]

// ── 复杂度问题 ──
interface Question {
  q: string
  options: { label: string; desc: string; scores: [number, number] }[]
}

const Q1: Question = {
  q: '大概要改动多少东西？',
  options: [
    { label: '就一两处', desc: '文章加个自动保存、帖子加个可见性', scores: [0, 0] },
    { label: '好几处，但不算大', desc: '加个许愿池、私信加群聊', scores: [1, 0] },
    { label: '很多东西要重新搞', desc: '智能 AI 助手、Obsidian-like 编辑器', scores: [2, 1] },
  ],
}

const Q2: Question = {
  q: '大概要做成什么样？',
  options: [
    { label: '小优化 / 小功能', desc: '改几处代码、加个小组件，不需要建新表', scores: [0, 0] },
    { label: '中等功能 / 新模块', desc: '建新表、多个页面、中等复杂度', scores: [1, 1] },
    { label: '大型系统 / 完整功能', desc: '复杂架构、AI 集成、重型编辑器等', scores: [2, 2] },
  ],
}

// ── 计算预估档位 ──
function estimateTier(scores: [number, number]): {
  tier: 'small' | 'medium' | 'large'
  tierLabel: string
  serviceFee: number
  apiCostRange: string
} {
  const total = scores[0] + scores[1]
  if (total <= 0) return { tier: 'small', tierLabel: '小功能', serviceFee: 0.5, apiCostRange: '≤ ¥1.5' }
  if (total <= 2) return { tier: 'medium', tierLabel: '中级开发', serviceFee: 3, apiCostRange: '¥1.5 ~ ¥10' }
  return { tier: 'large', tierLabel: '大型开发', serviceFee: 10, apiCostRange: '> ¥10' }
}

// ── 联系人类型 ──
const CONTACT_OPTIONS = [
  { value: 'dm', label: '站内私信', placeholder: '（我知道你是谁，不需要额外填写）' },
  { value: 'wechat', label: '微信', placeholder: '微信号' },
  { value: 'phone', label: '手机号', placeholder: '手机号码' },
]

/* ==============================================================
   组件主体
   ============================================================== */

export default function WishingPoolPage() {
  const router = useRouter()
  const session = getSession()

  // —— 步骤 1：复杂度 ——
  const [q1Idx, setQ1Idx] = useState<number | null>(null)
  const [q2Idx, setQ2Idx] = useState<number | null>(null)
  // —— 步骤 2：表单 ——
  const [description, setDescription] = useState('')
  const [contactType, setContactType] = useState(session ? 'dm' : 'wechat')
  const [contactDetail, setContactDetail] = useState('')
  const [modelPref, setModelPref] = useState('flash')
  const [extraMoney, setExtraMoney] = useState('')
  const [budgetCap, setBudgetCap] = useState('')
  // —— 流程状态 ——
  const [submitted, setSubmitted] = useState(false)
  const [requestNumber, setRequestNumber] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // —— 模型下拉展开 ——
  const [modelOpen, setModelOpen] = useState(false)

  // 预估
  const scores: [number, number] = [
    q1Idx !== null ? Q1.options[q1Idx].scores[0] : 0,
    q2Idx !== null ? Q2.options[q2Idx].scores[1] : 0,
  ]
  const estimate = estimateTier(
    (q1Idx !== null || q2Idx !== null) ? scores : [0, 0]
  )
  const bothAnswered = q1Idx !== null && q2Idx !== null

  // 表单验证
  const formValid = description.trim().length > 0

  // 提交
  const handleSubmit = useCallback(async () => {
    if (!formValid || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase.rpc('submit_wish', {
        p_description: description.trim(),
        p_contact_type: contactType,
        p_contact_detail: contactType === 'dm' ? null : (contactDetail.trim() || null),
        p_model_preference: modelPref,
        p_extra_money: extraMoney.trim() ? parseInt(extraMoney.trim(), 10) : 0,
        p_api_budget_cap: budgetCap.trim() ? parseInt(budgetCap.trim(), 10) : null,
        p_estimated_tier: estimate.tier,
        p_user_id: session?.userId || null,
      })

      if (rpcError) throw new Error(rpcError.message)
      setRequestNumber(data.request_number)
      setSubmitted(true)
    } catch (e: any) {
      setError(e.message || '提交失败，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }, [formValid, submitting, description, contactType, contactDetail, modelPref, extraMoney, budgetCap, estimate, session])

  const selectedModel = MODEL_OPTIONS.find((m) => m.value === modelPref) || MODEL_OPTIONS[0]

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* ========== 标题 ========== */}
        <div className={styles.header}>
          <h1>
            <FaIcon name="coins" /> 许愿池
          </h1>
          <p className={styles.subtitle}>
            想要什么功能？告诉我，我来帮你实现
          </p>
        </div>

        {/* ========== 流程说明 ========== */}
        <div className={styles.flowCard}>
          <div className={styles.flowSteps}>
            {[
              { step: '①', label: '写需求', desc: '填表说清楚你想要的' },
              { step: '②', label: '付服务费', desc: '微信扫码，付对应档位' },
              { step: '③', label: '等开发', desc: '1-2 个工作日开工' },
              { step: '④', label: '付 API 成本', desc: '实报实销，不赚差价' },
            ].map((f) => (
              <div key={f.step} className={styles.flowStep}>
                <span className={styles.flowStepNum}>{f.step}</span>
                <strong>{f.label}</strong>
                <span className={styles.flowStepDesc}>{f.desc}</span>
              </div>
            ))}
          </div>

          <div className={styles.warningBox}>
            <p><strong>⚠️ 开始之前先看清楚：</strong></p>
            <ul>
              <li><strong>服务费 ≠ 全部费用</strong>。服务费是首付，除此之外还可能有：</li>
              <ul>
                <li><strong>API 成本</strong> —— 开发完按实际用量收，不赚差价。参考：小功能约 ¥1，大开发约 ¥20-30。</li>
                <li><strong>数据库月费 / 域名年费</strong> —— 如果功能需要单独的数据库或域名，我会给几个方案让你选，费用你自己承担。</li>
              </ul>
              <li><strong>需求写得越详细，做得越贴合你的想法</strong>，反复修改才烧钱。</li>
              <li><strong>🐛 修 bug 免费</strong>，不需要走许愿池，直接站内私信我就行。</li>
              <li><strong>加钱越多，同类需求排名越靠前</strong>。</li>
              <li>目前只支持<strong>微信支付</strong>。</li>
            </ul>
          </div>
        </div>

        {!submitted ? (
          <>
            {/* ========== 1：复杂度判断 ========== */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNum}>1</span>
                看看你的需求属于哪一档
              </h2>
              <p className={styles.sectionHint}>
                描述越贴近实际 → 档位估得越准 → 成本越可控
              </p>

              {/* Q1 */}
              <div className={styles.qBlock}>
                <p className={styles.qText}>{Q1.q}</p>
                <div className={styles.qOptions}>
                  {Q1.options.map((opt, i) => (
                    <button
                      key={i}
                      className={`${styles.qOption} ${q1Idx === i ? styles.qOptionActive : ''}`}
                      onClick={() => setQ1Idx(i)}
                    >
                      <span className={styles.qOptionLabel}>{opt.label}</span>
                      <span className={styles.qOptionDesc}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Q2 */}
              <div className={styles.qBlock}>
                <p className={styles.qText}>{Q2.q}</p>
                <div className={styles.qOptions}>
                  {Q2.options.map((opt, i) => (
                    <button
                      key={i}
                      className={`${styles.qOption} ${q2Idx === i ? styles.qOptionActive : ''}`}
                      onClick={() => setQ2Idx(i)}
                    >
                      <span className={styles.qOptionLabel}>{opt.label}</span>
                      <span className={styles.qOptionDesc}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 预估结果 */}
              {bothAnswered && (
                <div className={styles.estimateCard}>
                  <div className={styles.estimateNormal}>
                    <span className={styles.estimateIcon}>👉</span>
                    <div>
                      <strong>预估档位：{estimate.tierLabel}</strong>
                      <p>
                        服务费 <strong>¥{estimate.serviceFee}</strong>（现在付，微信扫码）
                        &nbsp;+&nbsp; API 成本约 <strong>{estimate.apiCostRange}</strong>（开发完按实际收）
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ========== 2：填表 ========== */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNum}>2</span>
                说说你想要什么
              </h2>

              <div className={styles.form}>
                {/* 功能描述 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    想要的功能 <span className={styles.required}>*</span>
                  </label>
                  <div style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--border-radius)',
                    overflow: 'hidden',
                    height: 240,
                  }}>
                    <MarkdownEditor
                      value={description}
                      onChange={setDescription}
                      className={styles.editorInner}
                    />
                  </div>
                </div>

                {/* 联系方式 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>怎么联系你</label>
                  <div className={styles.contactOptions}>
                    {CONTACT_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        className={`${styles.contactOption} ${contactType === c.value ? styles.contactOptionActive : ''}`}
                        onClick={() => {
                          setContactType(c.value)
                          if (c.value === 'dm') setContactDetail('')
                        }}
                        disabled={c.value === 'dm' && !session}
                        title={c.value === 'dm' && !session ? '请先登录' : undefined}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  {contactType !== 'dm' && (
                    <input
                      className={styles.formInput}
                      type="text"
                      placeholder={CONTACT_OPTIONS.find((c) => c.value === contactType)?.placeholder}
                      value={contactDetail}
                      onChange={(e) => setContactDetail(e.target.value)}
                    />
                  )}
                  {contactType === 'dm' && session && (
                    <p className={styles.formHint}>
                      已登录为 <strong>@{session.username}</strong>，提交后可通过站内私信联系
                    </p>
                  )}
                  {contactType === 'dm' && !session && (
                    <p className={styles.formHintWarn}>请先登录才能使用站内私信联系</p>
                  )}
                </div>

                {/* 模型选择 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    想用哪个 AI 模型？
                    <span className={styles.formLabelExtra}>（默认不用管）</span>
                  </label>

                  {/* 桌面端：展开式卡片 */}
                  <div className={styles.modelPicker}>
                    <button
                      className={styles.modelTrigger}
                      onClick={() => setModelOpen(!modelOpen)}
                    >
                      <span>
                        <span className={styles.modelTriggerEmoji}>{selectedModel.emoji}</span>
                        {selectedModel.label}
                      </span>
                      <span className={`${styles.modelChevron} ${modelOpen ? styles.modelChevronOpen : ''}`}>▾</span>
                    </button>

                    {modelOpen && (
                      <div className={styles.modelDropdown}>
                        {MODEL_OPTIONS.map((m) => (
                          <button
                            key={m.value}
                            className={`${styles.modelOption} ${modelPref === m.value ? styles.modelOptionActive : ''}`}
                            onClick={() => { setModelPref(m.value); setModelOpen(false) }}
                          >
                            <span className={styles.modelOptionHeader}>
                              <span className={styles.modelEmoji}>{m.emoji}</span>
                              <strong>{m.label}</strong>
                            </span>
                            <span className={styles.modelDesc}>{m.desc}</span>
                            {m.costNote && (
                              <span className={styles.modelCostNote}>{m.costNote}</span>
                            )}
                            {modelPref === m.value && (
                              <span className={styles.modelCheck}>✓</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 加钱 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    加钱插队？
                    <span className={styles.formLabelExtra}>（选填，整数）</span>
                  </label>
                  <div className={styles.inputWithSuffix}>
                    <span className={styles.inputPrefix}>¥</span>
                    <input
                      className={styles.formInput}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="加越多排名越靠前"
                      value={extraMoney}
                      onChange={(e) => setExtraMoney(e.target.value)}
                    />
                  </div>
                  <p className={styles.formHint}>填写后我会联系你确认收款，确认后才生效</p>
                </div>

                {/* API 预算上限 */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    API 成本上限？
                    <span className={styles.formLabelExtra}>（选填）</span>
                  </label>
                  <div className={styles.inputWithSuffix}>
                    <span className={styles.inputPrefix}>¥</span>
                    <input
                      className={styles.formInput}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="超出后先联系你确认，不填就不限"
                      value={budgetCap}
                      onChange={(e) => setBudgetCap(e.target.value)}
                    />
                  </div>
                </div>

                {/* 提交按钮 */}
                {error && <p className={styles.formError}>❌ {error}</p>}

                <button
                  className={styles.submitBtn}
                  disabled={!formValid || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <><FaIcon name="spinner" spin /> 提交中…</>
                  ) : (
                    '提交需求'
                  )}
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* ========== 3：扫码付款 ========== */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNum}>3</span>
                扫码付服务费
              </h2>

              <div className={styles.paymentCard}>
                <div className={styles.requestBadge}>
                  你的需求编号：<strong>#{String(requestNumber).padStart(4, '0')}</strong>
                </div>

                <div className={styles.paymentBody}>
                  {/* 待放收款码图片的位置 */}
                  <div className={styles.qrArea}>
                    <img
                      src={`${BASE_PATH}/wechat-pay.jpg`}
                      alt="微信收款码"
                      className={styles.qrImg}
                    />
                    <p className={styles.qrHint}>
                      微信扫码 → 选择对应金额付款 → <strong>备注填 #{String(requestNumber).padStart(4, '0')}</strong>
                    </p>
                  </div>

                  <div className={styles.paymentInfo}>
                    <div className={styles.paymentRow}>
                      <span>你的档位</span>
                      <strong className={styles.paymentTier}>{estimate.tierLabel}</strong>
                    </div>
                    <div className={styles.paymentRow}>
                      <span>应付服务费</span>
                      <strong className={styles.paymentFee}>¥{estimate.serviceFee}</strong>
                    </div>
                    <div className={styles.paymentRow}>
                      <span>预估 API 成本（做完付）</span>
                      <span>{estimate.apiCostRange}</span>
                    </div>
                    <div className={styles.paymentRow}>
                      <span>模型选择</span>
                      <span>{selectedModel.emoji} {selectedModel.label}</span>
                    </div>
                    {extraMoney.trim() && parseInt(extraMoney.trim()) > 0 && (
                      <div className={styles.paymentRow}>
                        <span>加钱金额（待确认）</span>
                        <span>¥{parseInt(extraMoney.trim())}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.paymentFooter}>
                  <p>✅ 付款后 <strong>1 ~ 2 个工作日</strong>内开工</p>
                  <p>❓ 超过<strong>一周</strong>没动静？站内私信敲我</p>
                </div>

                <div style={{ padding: '16px 24px', textAlign: 'center' }}>
                  <button
                    className={styles.submitBtn}
                    onClick={() => router.push('/wishes')}
                    style={{ alignSelf: 'center' }}
                  >
                    我已付款，返回许愿池
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

      </div>
    </div>
  )
}
