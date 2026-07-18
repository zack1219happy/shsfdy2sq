'use client'

import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { getSession, tryRestoreSessionFromAuth } from '@/lib/auth'
import { submitPageRequest, fetchAllWikiPages, type WikiPageNav } from '@/lib/wiki-api'
import { registry, titleSlugMap as staticTitleMap } from '@/data/person-registry'
import { showWarningToast } from '@/lib/toast'
import styles from '@/styles/wiki-create.module.css'
import forumStyles from '@/styles/forum.module.css'

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false },
)

/** 从 person registry 建立中文人名 → slug 映射 */
function buildPersonNameMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const s of registry.students) {
    map[s.name] = s.newSlug       // "陈文一" → "people/cwy"
  }
  for (const t of registry.teachers ?? []) {
    map[t.name] = 'people/teachers'  // 教师无独立页面，指向教师列表页
  }
  return map
}

/** 构建完整的中文名称 → slug 映射表 */
function buildFullSlugMap(pages: WikiPageNav[]): Record<string, string> {
  const map: Record<string, string> = { ...staticTitleMap }

  // 从 DB pages 补充
  for (const p of pages) {
    // title → slug
    if (p.title && p.title !== p.slug) {
      map[p.title] = p.slug
    }
  }

  // 人名 → slug
  const personMap = buildPersonNameMap()
  for (const [name, slug] of Object.entries(personMap)) {
    if (!map[name]) map[name] = slug
  }

  return map
}

/**
 * 智能 slug 自动翻译：
 * 从左到右逐段匹配，已知中文名→slug 转换，未知段保留原样。
 * 例: "校园/花草/月季" → "campus/花草/月季"
 *      "人物/cwy" → "people/cwy"
 */
function autoTranslatePath(input: string, slugMap: Record<string, string>): string {
  const segments = input.split('/').filter(Boolean)
  if (segments.length === 0) return input

  const result: string[] = []
  let i = 0

  // 贪婪匹配：尽量匹配最长前缀
  while (i < segments.length) {
    let matched = false

    // 从当前到末尾尝试最长匹配
    for (let end = segments.length; end > i; end--) {
      const phrase = segments.slice(i, end).join('/')
      const mapped = slugMap[phrase]
      if (mapped) {
        result.push(mapped)
        i = end
        matched = true
        break
      }
    }

    if (matched) continue

    // 单个段匹配
    const seg = segments[i]
    const mapped = slugMap[seg]
    if (mapped) {
      result.push(mapped)
    } else {
      result.push(seg)  // 保持原样
    }
    i++
  }

  return result.join('/')
}

export default function WikiCreatePage() {
  const router = useRouter()
  const [session, setSession] = useState(getSession())

  // 表单状态
  const [pathInput, setPathInput] = useState('')     // 用户输入的原始路径（含中文）
  const [slug, setSlug] = useState('')                // 翻译后的 slug
  const [title, setTitle] = useState('')
  const [titleManuallySet, setTitleManuallySet] = useState(false)  // 用户是否手动改过标题
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // 映射表
  const [slugMap, setSlugMap] = useState<Record<string, string>>({ ...staticTitleMap })

  // 文件夹选择辅助
  const [folders, setFolders] = useState<string[]>([])
  const [folderOpen, setFolderOpen] = useState(false)
  const folderRef = useRef<HTMLDivElement>(null)

  // 检查登录
  useEffect(() => {
    tryRestoreSessionFromAuth().then(() => setSession(getSession()))
  }, [])

  // 加载现有页面，构建完整映射表
  useEffect(() => {
    ;(async () => {
      try {
        const pages: WikiPageNav[] = await fetchAllWikiPages()
        // 构建映射表
        const fullMap = buildFullSlugMap(pages)
        setSlugMap(fullMap)

        // 提取已有文件夹
        const folderSet = new Set<string>()
        for (const p of pages) {
          const segs = p.slug.split('/')
          for (let i = 1; i < segs.length; i++) {
            folderSet.add(segs.slice(0, i).join('/'))
          }
        }
        setFolders(Array.from(folderSet).sort())
      } catch { /* 静默失败 */ }
    })()
  }, [])

  // 当用户输入路径时，自动翻译，并自动填入页面标题
  const handlePathChange = useCallback((value: string) => {
    setPathInput(value)
    const newSlug = autoTranslatePath(value, slugMap)
    setSlug(newSlug)
    // 如果用户没有手动改过标题，从路径最后一段自动生成
    if (!titleManuallySet) {
      const segs = newSlug.split('/').filter(Boolean)
      if (segs.length > 0) {
        setTitle(segs[segs.length - 1])
      }
    }
  }, [slugMap, titleManuallySet])

  // 用户手动编辑标题后不再自动覆盖
  const handleTitleChange = useCallback((value: string) => {
    setTitleManuallySet(true)
    setTitle(value)
  }, [])

  // 选择已有文件夹 → 填入路径
  const selectFolder = useCallback((f: string) => {
    setFolderOpen(false)
    const base = f + '/'
    setPathInput(base)
    const newSlug = autoTranslatePath(base, slugMap)
    setSlug(newSlug)
    if (!titleManuallySet) {
      const segs = newSlug.split('/').filter(Boolean)
      if (segs.length > 0) setTitle(segs[segs.length - 1])
    }
  }, [slugMap, titleManuallySet])

  const clearFolderSelection = useCallback(() => {
    setFolderOpen(false)
    const idx = pathInput.indexOf('/')
    const rest = idx >= 0 ? pathInput.slice(idx + 1) : ''
    setPathInput(rest)
    const newSlug = autoTranslatePath(rest, slugMap)
    setSlug(newSlug)
    if (!titleManuallySet) {
      const segs = newSlug.split('/').filter(Boolean)
      if (segs.length > 0) setTitle(segs[segs.length - 1])
    }
  }, [pathInput, slugMap, titleManuallySet])

  // 点外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setFolderOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!slug.trim() || !title.trim() || submitting) return
    // slug 只允许字母数字中文连字符下划线斜杠
    if (!slug.match(/^[a-zA-Z0-9一-鿿_-]+(\/[a-zA-Z0-9一-鿿_-]+)*$/)) {
      setError('页面路径包含非法字符，仅支持字母、数字、中文、连字符和下划线')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submitPageRequest(slug.trim(), title.trim(), content.trim())
      showWarningToast('新建页面请求已提交审核 ✅')
      setSuccess(true)
    } catch (e: any) {
      setError(e?.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }, [slug, title, content, submitting])

  if (!session) {
    return (
      <div className={styles.createPage}>
        <p className={styles.loading}>请先登录</p>
      </div>
    )
  }

  // ── 提交成功界面 ──
  if (success) {
    return (
      <div className={styles.createPage}>
        <div className={styles.successCard}>
          <div className={styles.successIcon}>📝</div>
          <div className={styles.successTitle}>请求已提交</div>
          <div className={styles.successDesc}>
            你的新建页面请求已提交给管理员审核。<br />
            审核通过后，页面将自动创建。
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              className={`${forumStyles.btn} ${forumStyles.btnOutline}`}
              onClick={() => router.push('/wiki')}
            >
              ← 返回 Wiki
            </button>
            <button
              className={`${forumStyles.btn} ${forumStyles.btnPrimary}`}
              onClick={() => {
                setSuccess(false)
                setPathInput('')
                setSlug('')
                setTitle('')
                setTitleManuallySet(false)
                setContent('')
              }}
            >
              再建一个
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.createPage}>
      <div className={forumStyles.header}>
        <h2><FaIcon name="plus" /> 新建页面</h2>
        <button
          className={`${forumStyles.btn} ${forumStyles.btnOutline}`}
          onClick={() => router.push('/wiki')}
        >
          ← 返回
        </button>
      </div>

      {error && <div className={styles.error}>❌ {error}</div>}

      <div className={styles.form}>
        {/* ── 页面路径（URL） ── */}
        <div className={styles.pathSection}>
          <div className={styles.pathLabel}>页面路径（URL 标识，请使用英文）</div>

          {/* 输入行 */}
          <div className={styles.pathRow}>
            {/* 文件夹选择助手 */}
            <div className={styles.folderSelector} ref={folderRef}>
              <button
                className={styles.folderToggle}
                onClick={() => setFolderOpen((v) => !v)}
                type="button"
                title="从已有文件夹中选择"
              >
                <FaIcon name="folder" />
                选文件夹
                <FaIcon name="chevron-down" />
              </button>
              {folderOpen && (
                <div className={styles.folderDropdown}>
                  <button
                    className={`${styles.folderOption} ${!pathInput.includes('/') ? styles.folderOptionActive : ''}`}
                    onClick={clearFolderSelection}
                  >
                    <FaIcon name="folder-open" className={styles.folderOptionIcon} />
                    <span>根目录</span>
                    <span className={styles.folderSlug}>/</span>
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f}
                      className={`${styles.folderOption}`}
                      onClick={() => selectFolder(f)}
                    >
                      <FaIcon name="folder" className={styles.folderOptionIcon} />
                      <span>{f.split('/').pop()}</span>
                      <span className={styles.folderSlug}>{f}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 路径输入框 */}
            <input
              className={styles.slugInput}
              type="text"
              placeholder={'校园/花草/页面名'}
              value={pathInput}
              onChange={(e) => handlePathChange(e.target.value)}
              maxLength={150}
              autoFocus
            />
          </div>

          {/* 翻译后 slug 预览 */}
          {pathInput.trim() && (
            <div className={styles.pathPreview}>
              <FaIcon name="link" />
              <span>翻译后：</span>
              <span className={styles.pathPreviewSlug}>
                /wiki/
                {pathInput !== slug ? (
                  <>
                    <span className={styles.previewChanged}>{slug}</span>
                    <span className={styles.previewNote}>（中文已自动翻译）</span>
                  </>
                ) : (
                  slug
                )}
              </span>
            </div>
          )}
          <div className={styles.pathHint}>
            已知中文目录名会自动翻译为英文 slug（如「校园」→「campus」）。
            未知的中文词请手动改为拼音或英文。
          </div>
        </div>

        {/* 页面标题（显示用中文） */}
        <div className={styles.pathSection}>
          <div className={styles.pathLabel}>页面标题（显示名称，建议用中文）</div>
          <input
            className={forumStyles.titleInput}
            type="text"
            placeholder="如：月季图鉴"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            maxLength={100}
          />
        </div>

        {/* 内容编辑器 */}
        <div className={forumStyles.editorWrapper}>
          <MarkdownEditor
            value={content}
            onChange={setContent}
            className={forumStyles.editorNoBorder}
          />
        </div>

        {/* 提交按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            className={`${forumStyles.btn} ${forumStyles.btnPrimary}`}
            onClick={handleSubmit}
            disabled={submitting || !slug.trim() || !title.trim()}
          >
            {submitting ? '提交中…' : '提交审核'}
          </button>
        </div>
      </div>
    </div>
  )
}
