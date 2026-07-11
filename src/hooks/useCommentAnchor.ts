'use client'

import { useCallback } from 'react'

/**
 * 返回一个 ref 回调。将其挂在目标评论元素的 JSX 上，元素进入 DOM 时自动滚动 + 高亮。
 *
 * 不依赖任何状态协调或轮询 —— React 在 commit 阶段同步调用 ref 回调，
 * 这一刻就是"目标 DOM 元素已就绪"的确切信号。
 *
 * @example
 * ```tsx
 * const anchorRef = useCommentAnchor(styles.highlight, scrollKey)
 *
 * {comments.map(c => (
 *   <div
 *     id={`comment-${c.id}`}
 *     ref={c.id === targetCommentId ? anchorRef : undefined}
 *   >
 *     ...
 *   </div>
 * ))}
 * ```
 */
export function useCommentAnchor(
  highlightClassName: string,
  scrollKey: number = 0,
): (element: HTMLElement | null) => void {
  return useCallback((element: HTMLElement | null) => {
    if (!element) return

    // 元素刚进入 DOM —— 滚动到视野中央
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // 重置动画：移除 → 强制回流 → 重新添加
    element.classList.remove(highlightClassName)
    void element.offsetWidth

    const onAnimationEnd = () => {
      element.classList.remove(highlightClassName)
    }

    element.addEventListener('animationend', onAnimationEnd, { once: true })
    element.classList.add(highlightClassName)

    // React 19：返回 cleanup，ref 变化或组件卸载时自动调用
    return () => {
      element.classList.remove(highlightClassName)
      element.removeEventListener('animationend', onAnimationEnd)
    }
  }, [highlightClassName, scrollKey])
}
