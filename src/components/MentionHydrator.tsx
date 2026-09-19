'use client'

import { createPortal } from 'react-dom'
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { UserName } from './UserName'

/**
 * Markdown is rendered as HTML, so mention nodes need a small client-side
 * bridge before they can use the shared UserName component.
 */
export function useMentionHydration(
  containerRef: RefObject<HTMLElement | null>,
  contentKey: string,
): ReactNode {
  const [nodes, setNodes] = useState<HTMLElement[]>([])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      setNodes([])
      return
    }

    const targets: HTMLElement[] = []
    for (const wrapper of Array.from(container.querySelectorAll<HTMLElement>('.md-mention'))) {
      // Normalize both the current empty placeholder and the previous anchor
      // renderer before mounting UserName into the wrapper.
      const legacyMention = wrapper.dataset.mention
        ? wrapper
        : wrapper.querySelector<HTMLElement>('[data-mention]')
      const username = legacyMention?.dataset.mention
      if (!username) continue
      wrapper.dataset.mention = username
      wrapper.replaceChildren()
      targets.push(wrapper)
    }
    setNodes(targets)
  }, [containerRef, contentKey])

  return nodes.map((node, index) => {
    const username = node.dataset.mention
    if (!username) return null
    return createPortal(
      <>
        <span aria-hidden="true">@</span>
        <UserName username={username} />
      </>,
      node,
      `${contentKey}-${index}-${username}`,
    )
  })
}
