'use client'

import { getFileLinkStatuses } from '@/lib/api/files'

const FILE_DOWNLOAD_RE = /\/functions\/v1\/file-gateway\/download\/([0-9a-f-]{36})(?:$|[?#])/i

export function getFileShareToken(href: string): string | null {
  try {
    const match = new URL(href, window.location.origin).pathname.match(FILE_DOWNLOAD_RE)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Add the stale-file presentation to already-rendered Markdown links.
 * The link remains clickable so a transient cleanup failure does not hide
 * a file that is still available.
 */
export async function hydrateFileLinks(root: HTMLElement): Promise<void> {
  const anchors = [...root.querySelectorAll<HTMLAnchorElement>('a[href]')]
  const entries = anchors
    .map((anchor) => ({ anchor, token: getFileShareToken(anchor.href) }))
    .filter((entry): entry is { anchor: HTMLAnchorElement; token: string } => !!entry.token)
  if (entries.length === 0) return

  const statuses = await getFileLinkStatuses(entries.map((entry) => entry.token))
  for (const { anchor, token } of entries) {
    const state = statuses.get(token)
    if (!state) continue
    const expired = state.status !== 'active' || (state.expires_at != null && Date.parse(state.expires_at) <= Date.now())
    if (!expired) continue
    anchor.classList.add('file-link-expired')
    if (!anchor.textContent?.endsWith('（已过期）')) {
      anchor.textContent = `${anchor.textContent ?? ''}（已过期）`
    }
    anchor.setAttribute('aria-label', `${anchor.textContent ?? '文件'}，已过期`)
  }
}
