import type { NotificationType } from '@/types/gist'

export interface NotificationSummaryInput {
  from_username: string | null
  page: string
  excerpt: string | null
  type: NotificationType
  target_title: string | null
}

export type NotificationTargetKind = 'forum' | 'plaza' | 'wish' | 'wiki' | 'user' | 'agreement' | 'dm' | 'emoji'

export interface NotificationTarget {
  kind: NotificationTargetKind
  key: string
  canonicalPage: string
}

const MODERATION_ROUTE_PATTERNS: Partial<Record<NotificationType, RegExp>> = {
    wiki_revision_pending: /^admin\/revisions\?id=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    wiki_page_request_pending: /^admin\/revisions\?tab=requests&rid=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    tag_submission_pending: /^user\/shop\?submission=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function isModerationNotificationType(type: NotificationType): boolean {
    return type === 'wiki_revision_pending' ||
        type === 'wiki_page_request_pending' ||
        type === 'tag_submission_pending'
}

/** Build a same-site link for the supported review-notification destinations. */
export function getModerationNotificationHref(
    type: NotificationType,
    page: string | null | undefined,
    basePath: string,
    cacheBust: number,
): string | undefined {
    const route = clean(page)
    const routePattern = MODERATION_ROUTE_PATTERNS[type]
    if (!route || !routePattern?.test(route)) return undefined

    const prefix = basePath.replace(/\/+$/, '')
    return `${prefix}/${route}&_=${cacheBust}`
}

/** 将新旧两种通知页面格式统一成详情页所需的目标。 */
export function getNotificationTarget(page: string | null | undefined): NotificationTarget | null {
  const value = clean(page)
  if (!value) return null

  if (value.startsWith('forum/post?id=')) {
    const key = decode(value.slice('forum/post?id='.length))
    return key ? { kind: 'forum', key, canonicalPage: `forum/${key}` } : null
  }
  if (value.startsWith('forum/')) {
    const key = decode(value.slice('forum/'.length))
    return key ? { kind: 'forum', key, canonicalPage: `forum/${key}` } : null
  }

  if (value.startsWith('plaza/post?slug=')) {
    const key = decode(value.slice('plaza/post?slug='.length))
    return key ? { kind: 'plaza', key, canonicalPage: `plaza/${key}` } : null
  }
  if (value.startsWith('plaza/')) {
    const key = decode(value.slice('plaza/'.length))
    return key ? { kind: 'plaza', key, canonicalPage: `plaza/${key}` } : null
  }

  if (value.startsWith('wishes/')) {
    const key = decode(value.slice('wishes/'.length))
    return key ? { kind: 'wish', key, canonicalPage: `wishes/${key}` } : null
  }

  if (value.startsWith('user/')) {
    const key = decode(value.slice('user/'.length))
    return key ? { kind: 'user', key, canonicalPage: `user/${key}` } : null
  }

  if (value.startsWith('wiki/')) {
    const key = decode(value.slice('wiki/'.length))
    return key ? { kind: 'wiki', key, canonicalPage: `wiki/${key}` } : null
  }

  if (value.startsWith('agreement/')) {
    const key = decode(value.slice('agreement/'.length))
    return key ? { kind: 'agreement', key, canonicalPage: `agreement/${key}` } : null
  }

  if (value.startsWith('dm/')) {
    const key = decode(value.slice('dm/'.length))
    return key ? { kind: 'dm', key, canonicalPage: `dm?conv=${key}` } : null
  }

  if (value === 'emoji') {
    return { kind: 'emoji', key: '', canonicalPage: 'user/emoji' }
  }

  return null
}

function targetNoun(target: NotificationTarget | null): string {
  if (!target) return '内容'
  if (target.kind === 'forum') return '帖子'
  if (target.kind === 'plaza') return '文章'
  if (target.kind === 'wish') return '许愿'
  if (target.kind === 'wiki') return '页面'
  if (target.kind === 'agreement') return '公告'
  if (target.kind === 'dm') return '私信'
  if (target.kind === 'emoji') return '表情包'
  return '主页'
}

function ensureContext(
  message: string,
  actor: string,
  target: NotificationTarget | null,
  title: string,
): string {
  let result = message
  const alreadyDescribesTargetAction = Boolean(title && result.includes(title) && /投了|奖励|获得/.test(result))
  if (!result.includes(actor) && !(actor !== '系统' && alreadyDescribesTargetAction)) {
    result = `${actor}：${result}`
  }
  if (title && !result.includes(title)) {
    result += `（${targetNoun(target)}《${title}》）`
  }
  return result
}

/**
 * 生成通知中心展示的完整摘要。
 * 旧通知的 excerpt 可能已经包含标题或发送人，因此这里只补缺失信息，避免重复拼接。
 */
export function formatNotificationSummary(notification: NotificationSummaryInput): string {
  const actor = clean(notification.from_username) || '系统'
  const message = clean(notification.excerpt) || '有新的通知'
  const title = clean(notification.target_title)
  const target = getNotificationTarget(notification.page)
  const noun = targetNoun(target)
  const titledTarget = title ? `${noun}《${title}》` : `你的${noun}`

  switch (notification.type) {
    case 'wiki_revision_pending':
      return `${actor}提交了页面编辑待审核：${message}`
    case 'wiki_page_request_pending':
      return `${actor}申请新建页面待审核：${message}`
    case 'tag_submission_pending':
      return `${actor}申请创建标签：${message}`
    case 'wish_new':
      return `${actor}提交了新的许愿：${title || message}`
    case 'comment_reply':
      return `${actor}${title ? `在${titledTarget}下` : ''}回复了你：${message}`
    case 'page_owner':
      return `${actor}${title ? `在${titledTarget}下` : ''}留言：${message}`
    case 'user_message':
      return `${actor}在你的主页留言：${message}`
    case 'forum_reply':
      return `${actor}在${titledTarget}下回复了你：${message}`
    case 'wish_reply':
      return `${actor}在${titledTarget}下回复了你：${message}`
    case 'forum_like':
      return `${actor}赞了你的${title ? `${noun}《${title}》` : noun}`
    case 'plaza_like':
      return `${actor}赞了你的文章${title ? `《${title}》` : ''}`
    case 'wish_status_update':
      return `${actor}更新了${titledTarget}：${message}`
    case 'forum_post_update':
      return `${actor}更新了你的${title ? `${noun}《${title}》` : noun}：${message}`
    case 'plaza_tip':
      return ensureContext(message, actor, target, title)
    case 'forum_own_post':
      if (target?.kind === 'plaza' || /奖励|获得|投了/.test(message)) {
        return ensureContext(message, actor, target, title)
      }
      return `${actor}在${titledTarget}下发布了新动态：${message}`
    case 'dm':
      return `${actor}给你发来私信：${message}`
    case 'mention':
      return `${actor}在${titledTarget}里提到了你：${message}`
    case 'mention_edit':
      return `${actor}编辑了${titledTarget}，再次提到了你：${message}`
    case 'emoji_pack_deleted':
      return message
    default:
      return ensureContext(message, actor, target, title)
  }
}
