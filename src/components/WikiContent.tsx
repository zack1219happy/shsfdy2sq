'use client'

import { useMemo, useRef, useEffect, useLayoutEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { renderClientWithRegistry, replaceWikiLinks } from '@/lib/render-client'
import { registry, titleSlugMap as defaultTitleSlugMap } from '@/data/person-registry'
import { BASE_PATH } from '@/lib/constants'
import { fetchPageAssets } from '@/lib/wiki-api'
import { useCodeCopy } from '@/lib/useCodeCopy'
import SandboxBox from './SandboxBox'

interface Props {
    /** 原始内容（markdown 或 HTML） */
    content: string
    /** 内容格式，默认自动检测：含 <tag 的视为 HTML，否则按 markdown */
    format?: 'markdown' | 'html'
    className?: string
    /** 标题 → slug 映射，用于客户端渲染 [[Wiki 链接]]。不传则使用自动生成的映射 */
    titleSlugMap?: Record<string, string>
    /** 页面 slug，用于从 DB 加载 _assets/ 图片 base64 */
    slug?: string
    /** 跳过 DOMPurify 净化（用于启用了 JS 的页面） */
    noSanitize?: boolean
}

/** 分割后的内容片段 */
interface HtmlSegment { type: 'html'; id: string; content: string }
interface SandboxSegment { type: 'sandbox'; id: string; payload: string }
type Segment = HtmlSegment | SandboxSegment

/**
 * 通用内容渲染组件
 *
 * 统一经由 render-client 渲染：
 * - Markdown → HTML（markdown-it + highlight.js + KaTeX）
 * - 后处理 [[Wiki 链接]]
 * - _assets/ 图片替换为 DB 中的 base64 data URL
 * - DOMPurify 净化
 * - 代码块复制按钮
 * - ```sandbox 块：安全模式→代码块，JS 模式→<iframe srcdoc>（组件级隔离，不参与 innerHTML）
 */
export default function WikiContent({ content, format, className, titleSlugMap: propMap, slug, noSanitize }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const basePath = BASE_PATH
    const [assetMap, setAssetMap] = useState<Map<string, string> | null>(null)

    // 从 DB 加载当前页面的图片 base64（向上遍历父 slug）
    useEffect(() => {
        if (!slug) { setAssetMap(null); return }
        let cancelled = false
        const segments = slug.split('/')
        ;(async () => {
            const merged = new Map<string, string>()
            for (let i = segments.length; i > 0; i--) {
                const candidate = segments.slice(0, i).join('/')
                try {
                    const assets = await fetchPageAssets(candidate)
                    for (const [k, v] of assets) { if (!merged.has(k)) merged.set(k, v) }
                } catch { /* 跳过 */ }
            }
            if (!cancelled) setAssetMap(merged.size > 0 ? merged : null)
        })()
        return () => { cancelled = true }
    }, [slug])

    // 优先使用传入的映射，否则使用自动生成的默认映射
    const effectiveMap = propMap ?? defaultTitleSlugMap

    // 完整 HTML（不含 sandbox 替换），用于 details 状态追踪依赖
    const html = useMemo(() => {
        const shouldSanitize = !noSanitize
        const rawHtml =
            format === 'markdown' || (format !== 'html' && !looksLikeHtml(content))
                ? renderClientWithRegistry(content, registry, { highlight: true, texmath: true, anchor: true }, shouldSanitize)
                : (typeof window !== 'undefined' && shouldSanitize ? DOMPurify.sanitize(content) : content)

        // 替换 Wiki 链接
        const withLinks = replaceWikiLinks(rawHtml, effectiveMap, basePath)
        // 替换 _assets/ 图片为 DB base64 data URL
        const withAssets = replaceAssetSrcs(withLinks, assetMap)
        return withAssets
    }, [content, format, effectiveMap, basePath, assetMap, noSanitize])

    // 分割 HTML，将 .js-sandbox 占位分离为独立片段
    const segments: Segment[] = useMemo(() => splitHtml(html), [html])

    // ---- callout details open state persistence ----
    const detailsStateRef = useRef<Record<string, boolean>>({})
    const prevContentRef = useRef(content)
    if (prevContentRef.current !== content) {
        detailsStateRef.current = {}
        prevContentRef.current = content
    }

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const handler = (e: Event) => {
            const details = e.target as HTMLDetailsElement
            if (!details.classList.contains('callout')) return
            const all = el.querySelectorAll<HTMLDetailsElement>('details.callout')
            for (let i = 0; i < all.length; i++) {
                if (all[i] === details) {
                    detailsStateRef.current[String(i)] = details.open
                    return
                }
            }
        }
        el.addEventListener('toggle', handler, true)
        return () => el.removeEventListener('toggle', handler, true)
    }, [html])

    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const all = el.querySelectorAll<HTMLDetailsElement>('details.callout')
        for (let i = 0; i < all.length; i++) {
            const saved = detailsStateRef.current[String(i)]
            if (saved !== undefined && all[i].open !== saved) {
                all[i].open = saved
            }
        }
    })

    // 代码块复制按钮
    useCodeCopy(ref)

    return (
        <div ref={ref} className={className}>
            {segments.map((seg) =>
                seg.type === 'sandbox'
                    ? <SandboxBox key={seg.id} content={seg.payload} noSanitize={!!noSanitize} />
                    : <div key={seg.id} dangerouslySetInnerHTML={{ __html: seg.content }} />
            )}
        </div>
    )
}

/** 粗略判断一段文本是不是 HTML（含闭合标签） */
function looksLikeHtml(text: string): boolean {
    return /<[a-z][\s\S]*>[\s\S]*<\/[a-z]+>/i.test(text)
}

/** 将 HTML 中 <img src="_assets/xxx.webp"> 替换为 DB base64 data URL */
function replaceAssetSrcs(html: string, assetMap: Map<string, string> | null): string {
    if (!assetMap || assetMap.size === 0) return html
    return html.replace(
        /<img\s+([^>]*?)src="([^"]+)"([^>]*)>/gi,
        (match, before, src, after) => {
            if (!src.includes('_assets/') || src.startsWith('http') || src.startsWith('data:')) return match
            const rawFilename = src.split('/').pop()
            if (!rawFilename) return match
            const filename = decodeURIComponent(rawFilename)
            const dataUrl = assetMap.get(filename)
            if (!dataUrl) return match
            return `<img ${before}src="${dataUrl}"${after}>`
        },
    )
}

/**
 * 将 markdown-it 渲染后的 HTML 按 .js-sandbox 占位分割。
 * 分隔出的 sandbox 片段将单独由 SandboxBox 组件渲染（组件级隔离）。
 */
function splitHtml(html: string): Segment[] {
    const parts: Segment[] = []
    const SANDBOX_RE = /<div class="js-sandbox"[^>]*data-payload="([^"]*)"[^>]*><\/div>/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = SANDBOX_RE.exec(html)) !== null) {
        // 匹配位置之前的普通 HTML
        if (match.index > lastIndex) {
            parts.push({
                type: 'html',
                id: `h-${parts.length}`,
                content: html.slice(lastIndex, match.index),
            })
        }
        // sandbox 片段
        parts.push({
            type: 'sandbox',
            id: `sb-${match[1]}`,
            payload: decodeURIComponent(match[1]),
        })
        lastIndex = match.index + match[0].length
    }

    // 尾部剩余 HTML
    if (lastIndex < html.length) {
        parts.push({
            type: 'html',
            id: `h-${parts.length}`,
            content: html.slice(lastIndex),
        })
    }

    return parts
}
