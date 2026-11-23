/**
 * wiki-links.ts — [[Wiki 链接]] 目标解析
 *
 * 解析优先级（定稿）：
 *   1. 面包屑路径：[[people/tqy]] → slug 恰好是 people/tqy 的页面
 *   2. 英文标识（slug 尾段）：[[tqy]] → slug 尾段是 tqy 的页面，如 people/tqy
 *   3. 页面标题：[[校园]] → 标题为「校园」的页面
 *
 * 同一优先级命中多个页面时，取按字典序排在最前的一个，保证每次构建结果一致。
 * 链接显示文字保持「用户写什么显示什么」（除非用 [[目标|显示文字]] 指定），
 * 与 Obsidian 一致；只有 href 会被改写。
 */

export interface WikiLinkIndex {
  /** 全部 slug（已规范化、去重、按字典序排序） */
  slugs: string[]
  /** 小写 slug → slug */
  bySlug: Map<string, string>
  /** 小写 slug 尾段 → slug */
  byTail: Map<string, string>
  /** 原样标题 → slug */
  byTitle: Map<string, string>
  /** 小写标题 → slug（标题精确匹配失败时的兜底） */
  byTitleLower: Map<string, string>
  /** slug → 标题 */
  titleBySlug: Map<string, string>
}

/** 标题→slug 映射（Record 或 Map 皆可，与原 replaceWikiLinks 的鸭子类型保持一致） */
export type TitleSlugSource = Record<string, string> | Map<string, string>

const indexCache = new WeakMap<object, WikiLinkIndex>()

/** 去掉首尾斜杠、折叠重复斜杠。空串返回空串。 */
function normalizeSlug(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/')
}

/** 取 slug 的最后一段，作为「英文标识」 */
function tailOf(slug: string): string {
  const index = slug.lastIndexOf('/')
  return index === -1 ? slug : slug.slice(index + 1)
}

/** 解码渲染后 HTML 文本里的实体（标题里含 & < > 时才能匹配上） */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
}

/** 把数据文件里的纯文本转义成可插入 HTML 的文本节点 */
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildWikiLinkIndex(source: TitleSlugSource): WikiLinkIndex {
  const entries: [string, string][] =
    source instanceof Map ? [...source.entries()] : Object.entries(source)

  const slugs = [...new Set(entries.map(([, slug]) => normalizeSlug(String(slug))).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en'))

  const bySlug = new Map<string, string>()
  const byTail = new Map<string, string>()
  const titleBySlug = new Map<string, string>()
  const byTitle = new Map<string, string>()
  const byTitleLower = new Map<string, string>()

  for (const slug of slugs) {
    if (!bySlug.has(slug.toLowerCase())) bySlug.set(slug.toLowerCase(), slug)
    const tail = tailOf(slug)
    if (tail && !byTail.has(tail.toLowerCase())) byTail.set(tail.toLowerCase(), slug)
  }

  for (const [title, rawSlug] of entries) {
    const slug = normalizeSlug(String(rawSlug))
    if (!slug || !title) continue
    if (!titleBySlug.has(slug)) titleBySlug.set(slug, title)
    if (!byTitle.has(title)) byTitle.set(title, slug)
    const lower = title.toLowerCase()
    if (!byTitleLower.has(lower)) byTitleLower.set(lower, slug)
  }

  return { slugs, bySlug, byTail, byTitle, byTitleLower, titleBySlug }
}

/** 按对象身份缓存索引（titleSlugMap 是模块级常量或 useMemo 产物，身份稳定） */
export function getWikiLinkIndex(source: TitleSlugSource): WikiLinkIndex {
  const cached = indexCache.get(source as object)
  if (cached) return cached
  const index = buildWikiLinkIndex(source)
  indexCache.set(source as object, index)
  return index
}

/** 生成待匹配的候选字符串：原文、去实体、去首尾斜杠的变体 */
function candidatesOf(rawTarget: string): string[] {
  const out: string[] = []
  const push = (value: string) => {
    if (value && !out.includes(value)) out.push(value)
  }
  const trimmed = rawTarget.trim()
  push(trimmed)
  const decoded = decodeHtmlEntities(trimmed)
  push(decoded)
  push(normalizeSlug(trimmed))
  push(normalizeSlug(decoded))
  return out
}

/**
 * 解析 [[目标]] 指向的页面 slug。
 * @returns slug，未命中返回 null（调用方保留原文）
 */
export function resolveWikiLinkTarget(rawTarget: string, index: WikiLinkIndex): string | null {
  const candidates = candidatesOf(rawTarget)
  if (candidates.length === 0) return null

  // ① 面包屑：整条 slug 路径
  for (const candidate of candidates) {
    const hit = index.bySlug.get(candidate.toLowerCase())
    if (hit) return hit
  }

  // ② 英文标识：slug 尾段（带斜杠的目标说明本来想写路径，不做尾段猜测）
  for (const candidate of candidates) {
    if (candidate.includes('/')) continue
    const hit = index.byTail.get(candidate.toLowerCase())
    if (hit) return hit
  }

  // ③ 标题
  for (const candidate of candidates) {
    const exact = index.byTitle.get(candidate)
    if (exact) return exact
    const lower = index.byTitleLower.get(candidate.toLowerCase())
    if (lower) return lower
  }

  return null
}

/** slug 的分段编码，保留 `/` 作为路径分隔符 */
export function encodeSlugPath(slug: string): string {
  return slug.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

const WIKI_LINK_RE = /\[\[([^\]|]+?)(?:\|([^\]|]+?))?\]\]/g

/** 人名词条渲染出的 <a> 标签 */
const ANCHOR_TAG_RE = /<a\b[^>]*>/gi
const ANCHOR_CLASS_RE = /class="([^"]*)"/i
const ANCHOR_HREF_RE = /href="([^"]*)"/i
const SLUG_IN_HREF_RE = /[?&]slug=([^&#"']*)/i

/**
 * 修正教师链接的落点。
 *
 * 人名词条给教师生成的 href 是 `/wiki/people/teachers#qwl`，但站内根本没有
 * `/wiki/people/teachers` 这个路由（教师页只是一张 wiki 页面 `people/teachers`），
 * 而且那张表也没有 `id="qwl"` 锚点 —— 原链接点进去是 404。
 * 这里统一改写成能打开的地址：
 *   - 该教师有独立页面（`people/teachers/qwl`）→ 链到那一页
 *   - 没有独立页面 → 链到教师索引页 `people/teachers`
 */
export function relinkTeacherAnchors(
  html: string,
  source?: TitleSlugSource,
  basePath = '',
): string {
  if (!source || !html.includes('person-tch')) return html
  const index = getWikiLinkIndex(source)
  const bp = basePath.replace(/\/+$/, '')
  const indexSlug = index.bySlug.get('people/teachers') ?? 'people/teachers'
  const indexHref = `${bp}/wiki/page?slug=${encodeSlugPath(indexSlug)}`

  return html.replace(ANCHOR_TAG_RE, (tag) => {
    const classMatch = ANCHOR_CLASS_RE.exec(tag)
    if (!classMatch || !/person-tch\b/.test(classMatch[1])) return tag

    const hrefMatch = ANCHOR_HREF_RE.exec(tag)
    if (!hrefMatch) return tag
    const href = hrefMatch[1]

    // 已经是某个具体页面（不是教师索引页）就别动
    const slugMatch = SLUG_IN_HREF_RE.exec(href)
    const hrefSlug = slugMatch ? decodeURIComponent(slugMatch[1]) : ''
    if (hrefSlug && hrefSlug !== 'people/teachers') return tag

    const hashIndex = href.indexOf('#')
    const anchor = hashIndex >= 0 ? decodeURIComponent(href.slice(hashIndex + 1)) : ''
    const pageSlug = anchor ? index.bySlug.get(`people/teachers/${anchor}`.toLowerCase()) : undefined
    const nextHref = pageSlug ? `${bp}/wiki/page?slug=${encodeSlugPath(pageSlug)}` : indexHref
    return tag.replace(hrefMatch[0], `href="${nextHref}"`)
  })
}

const ORPHAN_PERSON_RE = /\[(tch|stu|usr):([^\][\s]{1,32})\]/g
const TAG_SPLIT_RE = /(<[^>]+>)/

/**
 * 注册表兜底：注册表里还没登记这个人，但页面已经建好了 —— 直接链到那一页。
 *
 * `[tch:cs]` 先走人名注册表；查不到时插件会把原文留在页面上。
 * 这里在渲染后补一层：如果 `people/teachers/cs` 这类页面存在，
 * 就把原文换成链接，显示文字优先用页面标题（没有就用输入的缩写）。
 * `<code>` / `<pre>` 内部以及标签本身不动。
 */
export function linkUnregisteredPersonRefs(
  html: string,
  source?: TitleSlugSource,
  basePath = '',
): string {
  if (!source || !/\[(tch|stu|usr):/.test(html)) return html
  const index = getWikiLinkIndex(source)
  const bp = basePath.replace(/\/+$/, '')

  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/gi)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      // 再按标签切分：只在文本片段里替换，避免改到属性值
      return part
        .split(TAG_SPLIT_RE)
        .map((segment, j) => {
          if (j % 2 === 1) return segment
          return segment.replace(ORPHAN_PERSON_RE, (match, type: string, input: string) => {
            const target = type === 'tch' ? `people/teachers/${input}` : `people/${input}`
            const slug = index.bySlug.get(target.toLowerCase())
            // 教师没登记、也没建独立页：退到教师索引页，表现和已登记的教师一致
            if (!slug && type !== 'tch') return match
            const pageSlug = slug ?? index.bySlug.get('people/teachers') ?? 'people/teachers'
            const href = `${bp}/wiki/page?slug=${encodeSlugPath(pageSlug)}`
            const title = index.titleBySlug.get(pageSlug)
            const text = slug && title && title !== pageSlug ? title : input
            return `<a href="${href}" class="person-link person-${type}">${escapeHtmlText(text)}</a>`
          })
        })
        .join('')
    })
    .join('')
}

/**
 * 人名词条相关的两步后处理：先修教师链接落点，再兜底补注册表里没有的人。
 * 三个渲染入口统一调用这个。
 */
export function enhancePersonLinks(
  html: string,
  source?: TitleSlugSource,
  basePath = '',
): string {
  return linkUnregisteredPersonRefs(relinkTeacherAnchors(html, source, basePath), source, basePath)
}

/**
 * 把渲染后 HTML 里的 [[Wiki 链接]] 换成 <a class="wiki-link">。
 *
 * - 目标解析见 resolveWikiLinkTarget（面包屑 > 英文标识 > 标题）
 * - 未命中的链接保留原文，不产生断链
 * - <code>/<pre> 内部的文本不动
 * - 显示文字：`[[目标|显示文字]]` 用显示文字；否则用**页面标题**
 *   （`[[campus]]` 显示「校园」，`[[people/tqy]]` 显示该页标题）
 */
export function replaceWikiLinks(
  html: string,
  titleSlugMap?: TitleSlugSource,
  basePath = '',
): string {
  if (!titleSlugMap) return html
  const index = getWikiLinkIndex(titleSlugMap)
  const bp = basePath.replace(/\/+$/, '')

  // 按 <code>/<pre> 分割，只处理纯文本段
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/gi)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part.replace(WIKI_LINK_RE, (match, title: string, label?: string) => {
        const slug = resolveWikiLinkTarget(title, index)
        if (!slug) return match
        const href =
          slug === 'home' ? `${bp}/wiki/` : `${bp}/wiki/page?slug=${encodeSlugPath(slug)}`
        // label 取自已渲染 HTML 文本（实体已转义），原样回填；
        // 页面标题来自数据文件，需要转义后再插入
        const pageTitle = index.titleBySlug.get(slug)
        const text = label
          ? label.trim()
          : pageTitle
            ? escapeHtmlText(pageTitle)
            : title.trim()
        return `<a href="${href}" class="wiki-link">${text}</a>`
      })
    })
    .join('')
}
