'use client'

import FaIcon from '@/components/FaIcon'
import type { PrivacyLevel, UserStats } from './types'
import styles from '@/styles/mypage.module.css'

/** tab 栏同行的统计条 */
export function StatsStrip({
    stats, isSelf, isMutual, visibility, onToggleVisibility,
}: {
    stats: UserStats
    isSelf: boolean
    isMutual: boolean
    visibility: PrivacyLevel
    onToggleVisibility?: () => void
}) {
    if (!isSelf && visibility !== 'public' && !(visibility === 'friends' && isMutual)) return null

    const items: { label: string; value: number }[] = [
        { label: '累计积分', value: stats.currentPoints },
        { label: '累计发帖', value: stats.postsCount },
        { label: '累计发文', value: stats.articlesCount },
        { label: '累计评论', value: stats.commentsCount },
        { label: '编辑/新建', value: stats.pageEditsCount },
        { label: '累计许愿', value: stats.wishesCount },
    ]

    return (
        <div className={styles.statsStrip}>
            {isSelf && onToggleVisibility && (
                <PrivacyToggle level={visibility} onToggle={onToggleVisibility} />
            )}
            {items.map((item, i) => (
                <span key={i} className={styles.statChip}>
                    <span className={styles.statChipLabel}>{item.label}</span>
                    <span className={styles.statChipValue}>{item.value}</span>
                </span>
            ))}
        </div>
    )
}

const PRIVACY_ICON: Record<PrivacyLevel, string> = {
    public: 'eye',
    friends: 'users',
    private: 'key',
}

const PRIVACY_LABEL: Record<PrivacyLevel, string> = {
    public: '公开',
    friends: '互关可见',
    private: '仅自己',
}

/** 可见性切换图标 */
export function PrivacyToggle({ level, onToggle }: {
    level: PrivacyLevel
    onToggle: () => void
}) {
    return (
        <button
            className={styles.privacyToggle}
            onClick={onToggle}
            title={`可见性：${PRIVACY_LABEL[level]} — 点击切换`}
        >
            <FaIcon name={PRIVACY_ICON[level]} />
        </button>
    )
}
