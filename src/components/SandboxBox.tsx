'use client'

import { useRef, useEffect, useMemo, useState } from 'react'

interface Props {
    /** 原始 HTML/CSS/JS 内容（已从 data-payload 解码） */
    content: string
    /** true=JS 模式显示 iframe，false=安全模式显示代码块 */
    noSanitize: boolean
}

/**
 * ```sandbox 块渲染组件
 *
 * 核心设计：iframe 在 mount 时通过 DOM API 创建，**永不销毁**。
 * noSanitize 切换只控制显隐，避免 React re-render 重建 iframe 导致游戏状态丢失。
 * content 变化时（文章编辑）key 变化触发 remount，旧 iframe 被销毁重建。
 *
 * 键盘事件：不自动 focus，用户点击 iframe 自然获得焦点。父页面无全局键盘拦截。
 */
export default function SandboxBox({ content, noSanitize }: Props) {
    const iframeContainerRef = useRef<HTMLDivElement>(null)
    const iframeRef = useRef<HTMLIFrameElement | null>(null)
    const iframeCreated = useRef(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // 监听全屏状态变化
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    // mount 时创建 iframe，仅一次（appendChild 使 iframe 脱离 React 管控）
    useEffect(() => {
        if (iframeCreated.current) return
        iframeCreated.current = true

        const iframe = document.createElement('iframe')
        iframe.srcdoc = content
        iframe.sandbox = 'allow-scripts allow-same-origin'
        iframe.style.cssText = 'width:100%;border:none;display:block;min-height:300px;border-radius:var(--border-radius)'
        iframe.addEventListener('load', () => {
            try {
                const doc = iframe.contentDocument
                if (!doc) return
                const h = Math.max(
                    doc.body?.scrollHeight || 0,
                    doc.body?.offsetHeight || 0,
                    doc.documentElement?.scrollHeight || 0,
                    doc.documentElement?.offsetHeight || 0,
                )
                if (h > 50) iframe.style.height = h + 'px'
            } catch { /* 跨域限制，保留 min-height */ }
        })
        iframeContainerRef.current!.appendChild(iframe)
        iframeRef.current = iframe
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // 切换到 JS 模式时（容器 visible → block），重新读取高度
    // mount 时 iframe 在 display:none 下加载，scrollHeight 为 0
    useEffect(() => {
        if (!noSanitize || !iframeRef.current) return
        const iframe = iframeRef.current
        // 等浏览器完成 layout 后再读
        requestAnimationFrame(() => {
            try {
                const doc = iframe.contentDocument
                if (!doc) return
                const h = Math.max(
                    doc.body?.scrollHeight || 0,
                    doc.body?.offsetHeight || 0,
                    doc.documentElement?.scrollHeight || 0,
                    doc.documentElement?.offsetHeight || 0,
                )
                if (h > 50) iframe.style.height = h + 'px'
            } catch { /* 跨域限制 */ }
        })
    }, [noSanitize])

    const toggleFullscreen = () => {
        if (isFullscreen) {
            document.exitFullscreen()
        } else if (iframeRef.current) {
            iframeRef.current.requestFullscreen()
        }
    }

    // 安全模式显示的代码块
    const escaped = useMemo(() => {
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
    }, [content])

    return (
        <div
            className="sandbox-box"
            style={{ position: 'relative', borderRadius: 'var(--border-radius)', overflow: 'clip' }}
        >
            {/* iframe 容器：React 只控制显隐，iframe 本身不受 React 影响 */}
            <div
                ref={iframeContainerRef}
                style={{ display: noSanitize ? 'block' : 'none' }}
            />

            {/* 安全模式：显示代码块（带复制按钮） */}
            {!noSanitize && (
                <div className="code-block-wrapper">
                    <div className="code-block-header">
                        <span className="code-lang">sandbox</span>
                        <button className="code-copy-btn" data-code-copy-btn title="复制代码">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                                <rect x="9" y="9" width="13" height="13" rx="2" />
                                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                            复制
                        </button>
                    </div>
                    <pre className="hljs"><code className="language-sandbox">{escaped}</code></pre>
                </div>
            )}

            {/* 全屏按钮：hover 浮现，仅 JS 模式显示 */}
            {noSanitize && (
                <button
                    onClick={toggleFullscreen}
                    className="sandbox-fs-btn"
                    title={isFullscreen ? '退出全屏' : '全屏'}
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        zIndex: 1,
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        background: 'rgba(0,0,0,0.45)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--border-radius)',
                        cursor: 'pointer',
                        padding: 6,
                        lineHeight: 0,
                    }}
                >
                    {isFullscreen ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="4 14 10 14 10 20" />
                            <polyline points="20 10 14 10 14 4" />
                            <line x1="14" y1="10" x2="21" y2="3" />
                            <line x1="9" y1="15" x2="4" y2="20" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                    )}
                </button>
            )}

            {/* hover 显隐控制 */}
            <style>{`
                .sandbox-box:hover .sandbox-fs-btn {
                    opacity: 1 !important;
                }
                .sandbox-fs-btn:hover {
                    background: rgba(0,0,0,0.65) !important;
                }
            `}</style>
        </div>
    )
}
