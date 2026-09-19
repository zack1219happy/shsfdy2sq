'use client'

/* ============================================
   表情包管理页 — 只管理当前登录者自己的表情库
   --------------------------------------------
   无参数：进来就是「我」的库。
   散表情 / 我创建的包 / 订阅来的包三块；订阅来的包只读。
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { showWarningToast } from '@/lib/toast'
import { loadLibrary } from '@/lib/emoji/store'
import { useEmojiLibrary } from '@/lib/emoji/use-emoji-context'
import {
  createEmojiPack,
  deleteEmoji,
  setEmojiPack,
  unsubscribePack,
  uploadEmoji,
} from '@/lib/emoji/store'
import { prepareEmojiFile, uploadEmojiImage } from '@/lib/emoji/upload'
import { checkNameError } from '@/components/EmojiDialogHost'
import styles from '@/styles/emoji.module.css'
import type { EmojiItem, EmojiPack } from '@/lib/emoji/types'

const DATE_FMT: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit' }

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', DATE_FMT)
}

export default function EmojiManagePage() {
  const router = useRouter()
  const session = getSession()
  const myId = session?.userId ?? null
  const lib = useEmojiLibrary(myId)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'upload' | 'create'>('search')
  const [packName, setPackName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) router.push('/')
  }, [session, router])

  const takenNames = useMemo(
    () => [...(lib?.emojis ?? []).map((e) => e.name), ...(lib?.packs ?? []).map((p) => p.name)],
    [lib],
  )
  const ownPacks = useMemo(() => (lib?.packs ?? []).filter((p) => !p.subscribed), [lib])
  const subscribedPacks = useMemo(() => (lib?.packs ?? []).filter((p) => p.subscribed), [lib])
  const loose = useMemo(() => lib?.emojis ?? [], [lib])

  const match = useCallback((name: string) => !query || name.toLowerCase().includes(query.toLowerCase()), [query])

  const visibleOwnPacks = ownPacks.filter((p) => match(p.name))
  const visibleSubPacks = subscribedPacks.filter((p) => match(p.name))
  const visibleLoose = loose.filter((e) => match(e.name))

  const packOptions = ownPacks

  const handleCreatePack = async () => {
    const problem = checkNameError(packName, takenNames)
    if (problem) { showWarningToast(problem); return }
    setBusy(true)
    try {
      await createEmojiPack(packName)
      setPackName('')
      setMode('search')
      showWarningToast('表情包已创建')
    } catch (e) {
      showWarningToast((e as Error).message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleMove = async (emoji: EmojiItem, packId: string | null) => {
    try {
      await setEmojiPack(emoji.id, packId)
    } catch (e) {
      showWarningToast((e as Error).message || '操作失败')
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`确定删除「${label}」？订阅它的人会自动失去这个表情。`)) return
    try {
      await deleteEmoji(id)
    } catch (e) {
      showWarningToast((e as Error).message || '删除失败')
    }
  }

  const handleUnsubscribe = async (pack: EmojiPack) => {
    if (!pack.subscription_id) return
    if (!window.confirm(`不再订阅《${pack.name}》？`)) return
    try {
      await unsubscribePack(pack.subscription_id)
    } catch (e) {
      showWarningToast((e as Error).message || '退订失败')
    }
  }

  if (!session) return null

  return (
    <>
      <div className={styles.titleBand}>
        <div className={styles.titleBandInner}>
          <div className={styles.head}>
            <h2 className={styles.title}><FaIcon name="laugh-beam" /> 表情包管理</h2>
            <div className={styles.headActions}>
              <button
                type="button"
                className={`${styles.iconBtn} ${mode === 'search' ? styles.iconBtnActive : ''}`}
                title="搜索"
                aria-label="搜索"
                onClick={() => setMode('search')}
              >
                <FaIcon name="search" />
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${mode === 'create' ? styles.iconBtnActive : ''}`}
                title="新建表情包"
                aria-label="新建表情包"
                onClick={() => setMode('create')}
              >
                <FaIcon name="folder-plus" />
              </button>
              <button
                type="button"
                className={`${styles.iconBtn} ${mode === 'upload' ? styles.iconBtnActive : ''}`}
                title="上传表情"
                aria-label="上传表情"
                onClick={() => setMode('upload')}
              >
                <FaIcon name="upload" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.page}>
        {mode === 'search' && (
          <div className={styles.toolbar}>
            <input
              className={`${styles.dialogInput} ${styles.search}`}
              placeholder="搜索表情 / 表情包"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}

      {mode === 'create' && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>新建表情包</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className={`${styles.dialogInput} ${styles.search}`}
              placeholder="名字（≤20 字，不能带半角冒号括号花括号）"
              value={packName}
              maxLength={40}
              onChange={(e) => setPackName(e.target.value)}
            />
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={busy || Boolean(checkNameError(packName, takenNames))}
              onClick={() => void handleCreatePack()}
            >
              创建
            </button>
          </div>
          {packName && checkNameError(packName, takenNames) && (
            <p className={styles.dialogError}>{checkNameError(packName, takenNames)}</p>
          )}
        </div>
      )}

      {mode === 'upload' && (
        <UploadPanel
          takenNames={takenNames}
          packs={packOptions}
          onDone={async () => {
            if (myId) await loadLibrary(myId)
            setMode('search')
          }}
        />
      )}

      {mode === 'search' && (
        <>
          <Section title={`我的表情包（${visibleOwnPacks.length}）`}>
            {visibleOwnPacks.length === 0 ? (
              <p className={styles.empty}>还没有表情包。表情包里的表情会显示在你的用户主页。</p>
            ) : (
              <div className={styles.packGrid}>
                {visibleOwnPacks.map((pack) => (
                  <PackCard
                    key={pack.id}
                    pack={pack}
                    mine
                    onMove={handleMove}
                    onDelete={handleDelete}
                    packOptions={packOptions.filter((p) => p.id !== pack.id)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title={`散表情（${visibleLoose.length}）`}>
            {visibleLoose.length === 0 ? (
              <p className={styles.empty}>
                散表情只有你发出去之后别人才能右键加，用户主页不显示散表情。
              </p>
            ) : (
              <div className={styles.chipRow}>
                {visibleLoose.map((emoji) => (
                  <EmojiChip
                    key={emoji.id}
                    emoji={emoji}
                    packOptions={packOptions}
                    onMove={(packId) => void handleMove(emoji, packId)}
                    onDelete={() => void handleDelete(emoji.id, emoji.name)}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title={`订阅的表情包（${visibleSubPacks.length}）`}>
            {visibleSubPacks.length === 0 ? (
              <p className={styles.empty}>
                在别人的文章、评论或用户主页上右键表情包，选「添加整个表情包」即可订阅；订阅后作者更新会同步过来。
              </p>
            ) : (
              <div className={styles.packGrid}>
                {visibleSubPacks.map((pack) => (
                  <div key={pack.id}>
                    <PackCard pack={pack} mine={false} onDelete={() => undefined} packOptions={[]}
                      onMove={() => undefined} onUnsubscribe={() => void handleUnsubscribe(pack)} />
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
      </div>
    </>
  )
}

/* ---------- 分区 ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

/* ---------- 表情包卡片（管理页形态） ---------- */

function PackCard({ pack, mine, packOptions, onMove, onDelete, onUnsubscribe }: {
  pack: EmojiPack
  mine: boolean
  packOptions: EmojiPack[]
  onMove: (emoji: EmojiItem, packId: string | null) => void
  onDelete: (id: string, label: string) => void
  onUnsubscribe?: () => void
}) {
  return (
    <div
      className={styles.packCard}
      data-pack-source-user={pack.source_user_id ?? ''}
      data-pack-id={pack.id}
      data-pack-name={pack.name}
      data-pack-source-name={pack.source_name}
    >
      <div className={styles.packHead}>
        <span className={styles.packName}>
          {pack.name}
          {pack.subscribed && <span className={styles.subscribedTag}>订阅</span>}
        </span>
        <span className={styles.packMeta}>
          {formatDate(pack.created_at)} · 添加 {pack.subscribers}
          {mine && (
            <button
              type="button"
              className={styles.chipOp}
              title="删除这个表情包"
              onClick={() => onDelete(pack.id, pack.name)}
            >
              <FaIcon name="trash" />
            </button>
          )}
          {!mine && onUnsubscribe && (
            <button type="button" className={styles.chipOp} title="不再订阅" onClick={onUnsubscribe}>
              <FaIcon name="times" />
            </button>
          )}
        </span>
      </div>
      <div className={styles.packEmojiRow}>
        {pack.emojis.map((emoji) => (
          <div key={emoji.id} className={styles.chip}>
            {emoji.banned ? (
              <span className={styles.banned}>违规表情</span>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- 表情图尺寸不定、来源为用户上传，不适合 next/image */
              <img
                className={styles.emojiImg}
                src={emoji.url}
                alt={emoji.name}
                data-emoji-name={emoji.name}
                data-emoji-hash={emoji.hash}
                data-emoji-url={emoji.url}
                data-emoji-source-pack={pack.source_name}
                data-emoji-source-pack-id={pack.id}
                data-emoji-source-pack-name={pack.source_name}
                data-emoji-source-user={emoji.source_user_id}
              />
            )}
            <span className={styles.chipName}>{emoji.name}</span>
            {mine && (
              <span className={styles.chipOps}>
                <select
                  className={styles.chipOp}
                  title="移到其它包"
                  value={pack.id}
                  onChange={(e) => onMove(emoji, e.target.value || null)}
                >
                  <option value="">移出包</option>
                  {packOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.chipOp}
                  title="删除表情"
                  onClick={() => onDelete(emoji.id, emoji.name)}
                >
                  <FaIcon name="times" />
                </button>
              </span>
            )}
          </div>
        ))}
        {pack.emojis.length === 0 && <p className={styles.empty}>这个包里还没有表情</p>}
      </div>
    </div>
  )
}

/* ---------- 散表情 ---------- */

function EmojiChip({ emoji, packOptions, onMove, onDelete }: {
  emoji: EmojiItem
  packOptions: EmojiPack[]
  onMove: (packId: string | null) => void
  onDelete: () => void
}) {
  return (
    <div className={styles.chip}>
      {emoji.banned ? (
        <span className={styles.banned}>违规表情</span>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- 表情图尺寸不定、来源为用户上传，不适合 next/image */
        <img
          className={styles.emojiImg}
          src={emoji.url}
          alt={emoji.name}
          data-emoji-name={emoji.name}
          data-emoji-hash={emoji.hash}
          data-emoji-url={emoji.url}
          data-emoji-source-user={emoji.source_user_id}
        />
      )}
      <span className={styles.chipName}>{emoji.name}</span>
      <span className={styles.chipOps}>
        <select className={styles.chipOp} title="放入表情包" value="" onChange={(e) => onMove(e.target.value || null)}>
          <option value="">无</option>
          {packOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button type="button" className={styles.chipOp} title="删除" onClick={onDelete}>
          <FaIcon name="times" />
        </button>
      </span>
    </div>
  )
}

/* ---------- 上传面板 ---------- */

function UploadPanel({ takenNames, packs, onDone }: {
  takenNames: string[]
  packs: EmojiPack[]
  onDone: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [packId, setPackId] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState<{ url: string; hash: string; size: number; ext: string } | null>(null)

  const nameError = checkNameError(name, takenNames)
  const blocked = Boolean(nameError) || !prepared || busy

  const handleFile = useCallback(async (file: File) => {
    setError('')
    setPrepared(null)
    try {
      const preparedImage = await prepareEmojiFile(file)
      const url = await uploadEmojiImage(preparedImage.blob, preparedImage.ext)
      setPrepared({ url, hash: preparedImage.hash, size: preparedImage.blob.size, ext: preparedImage.ext })
    } catch (e) {
      setError((e as Error).message || '上传失败')
    }
  }, [])

  const submit = async () => {
    if (!prepared) return
    const problem = checkNameError(name, takenNames)
    if (problem) { setError(problem); return }
    setBusy(true)
    try {
      await uploadEmoji({ name, url: prepared.url, hash: prepared.hash, packId: packId || null })
      showWarningToast('表情已加入')
      setName('')
      setPrepared(null)
      await onDone()
    } catch (e) {
      setError((e as Error).message || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>上传表情</div>

      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
        onClick={() => void 0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
          id="emoji-file-input"
        />
        {prepared ? (
          <span className={styles.previewWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 上传预览，尺寸未知 */}
            <img className={styles.previewImg} src={prepared.url} alt="预览" />
            <span className={styles.previewMeta}>
              {(prepared.size / 1024).toFixed(0)} KB · {prepared.ext.toUpperCase()}<br />
              指纹 {prepared.hash.slice(0, 12)}…
            </span>
          </span>
        ) : (
          <label htmlFor="emoji-file-input" style={{ cursor: 'pointer' }}>
            点击选择图片（≤2MB、边长 ≤512px，GIF 原样保留不动画）
          </label>
        )}
      </div>

      <label className={styles.dialogLabel} htmlFor="emoji-name-input">表情名字</label>
      <input
        id="emoji-name-input"
        className={`${styles.dialogInput} ${nameError && name ? styles.dialogInputInvalid : ''}`}
        value={name}
        maxLength={40}
        placeholder="≤20 字，不能带半角冒号、括号、花括号"
        onChange={(e) => { setName(e.target.value); setError('') }}
      />
      {name && nameError && <p className={styles.dialogError}>{nameError}</p>}

      {packs.length > 0 && (
        <>
          <label className={styles.dialogLabel} htmlFor="emoji-pack-input">放进表情包（可选）</label>
          <select
            id="emoji-pack-input"
            className={styles.dialogInput}
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
          >
            <option value="">不放进包（散表情）</option>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </>
      )}

      {error && <p className={styles.dialogError}>{error}</p>}

      <div className={styles.dialogActions}>
        <button type="button" className={styles.btn} onClick={onDone}>取消</button>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={blocked}
          onClick={() => void submit()}
        >
          加入我的表情
        </button>
      </div>
    </div>
  )
}
