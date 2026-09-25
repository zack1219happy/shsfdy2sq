'use client'

import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import { BASE_PATH } from '@/lib/constants'
import { formatDateShort } from '@/lib/forum'
import type { FollowUser, ForumPostItem, PlazaArticleItem, PrivacyLevel } from './types'
import { PrivacyToggle } from './StatsStrip'
import styles from '@/styles/mypage.module.css'

function canView(visibility: PrivacyLevel, isSelf: boolean, isMutual: boolean): boolean {
    return isSelf || visibility === 'public' || (visibility === 'friends' && isMutual)
}

/** 帖子列表 tab */
export function PostsTab({
    posts, loading, isSelf, isMutual, visibility, onToggleVisibility,
}: {
    posts: ForumPostItem[]
    loading?: boolean
    isSelf: boolean
    isMutual: boolean
    visibility: PrivacyLevel
    onToggleVisibility?: () => void
}) {
    if (!canView(visibility, isSelf, isMutual)) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="key" /></div>
                    <p className={styles.placeholderText}>对方未公开帖子列表</p>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="spinner" spin /></div>
                    <p className={styles.placeholderText}>加载中…</p>
                </div>
            </div>
        )
    }

    if (posts.length === 0) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="comments" /></div>
                    <p className={styles.placeholderText}>暂无帖子</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.tabContent}>
            {isSelf && onToggleVisibility && (
                <div className={styles.tabSectionHeader}>
                    <span className={styles.tabSectionTitle}><FaIcon name="comments" /> 帖子</span>
                    <span className={styles.tabSectionNote}>只显示对所有人公开的帖子</span>
                    <PrivacyToggle level={visibility} onToggle={onToggleVisibility} />
                </div>
            )}
            {posts.map(post => (
                <a
                    key={post.id}
                    href={`${BASE_PATH}/forum/post?id=${post.id}`}
                    className={styles.listCard}
                >
                    <div className={styles.listCardBody}>
                        <h4 className={styles.listCardTitle}>{post.title}</h4>
                    </div>
                    <div className={styles.listCardMeta}>
                        <span><FaIcon name="arrow-up" /> {post.upvotes}</span>
                        <span><FaIcon name="comments" /> {post.comment_count}</span>
                        <span className={styles.listCardDate}>{formatDateShort(post.created_at)}</span>
                    </div>
                </a>
            ))}
        </div>
    )
}

/** 文章列表 tab */
export function ArticlesTab({
    articles, loading, isSelf, isMutual, visibility, onToggleVisibility,
}: {
    articles: PlazaArticleItem[]
    loading?: boolean
    isSelf: boolean
    isMutual: boolean
    visibility: PrivacyLevel
    onToggleVisibility?: () => void
}) {
    if (!canView(visibility, isSelf, isMutual)) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="key" /></div>
                    <p className={styles.placeholderText}>对方未公开文章列表</p>
                </div>
            </div>
        )
    }

    // 非本人仅显示公开文章
    const visibleArticles = isSelf ? articles : articles.filter(a => a.is_public)

    if (loading) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="spinner" spin /></div>
                    <p className={styles.placeholderText}>加载中…</p>
                </div>
            </div>
        )
    }

    if (visibleArticles.length === 0) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="newspaper" /></div>
                    <p className={styles.placeholderText}>暂无文章</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.tabContent}>
            {isSelf && onToggleVisibility && (
                <div className={styles.tabSectionHeader}>
                    <span className={styles.tabSectionTitle}><FaIcon name="newspaper" /> 文章</span>
                    <PrivacyToggle level={visibility} onToggle={onToggleVisibility} />
                </div>
            )}
            {visibleArticles.map(article => (
                <a
                    key={article.id}
                    href={`${BASE_PATH}/plaza/post?slug=${article.slug}`}
                    className={styles.listCard}
                >
                    <div className={styles.listCardBody}>
                        <h4 className={styles.listCardTitle}>
                            {article.title}
                            {!article.is_public && (
                                <span className={styles.privateBadge}><FaIcon name="key" /> 私密</span>
                            )}
                        </h4>
                    </div>
                    <div className={styles.listCardMeta}>
                        <span><FaIcon name="arrow-up" /> {article.upvote_count}</span>
                        <span><FaIcon name="comments" /> {article.comment_count}</span>
                        <span className={styles.listCardDate}>{formatDateShort(article.created_at)}</span>
                    </div>
                </a>
            ))}
        </div>
    )
}

/** 关注/粉丝 tab */
export function FollowsTab({
    following, followers, loading, isSelf, isMutual, visibility, onToggleVisibility, activeSubTab, onSubTabChange,
}: {
    following: FollowUser[]
    followers: FollowUser[]
    loading?: boolean
    isSelf: boolean
    isMutual: boolean
    visibility: PrivacyLevel
    onToggleVisibility?: () => void
    activeSubTab: 'following' | 'followers'
    onSubTabChange: (t: 'following' | 'followers') => void
}) {
    if (!canView(visibility, isSelf, isMutual)) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="key" /></div>
                    <p className={styles.placeholderText}>对方未公开关注列表</p>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <div className={styles.tabContent}>
                <div className={styles.placeholderTab}>
                    <div className={styles.placeholderIcon}><FaIcon name="spinner" spin /></div>
                    <p className={styles.placeholderText}>加载中…</p>
                </div>
            </div>
        )
    }

    const list = activeSubTab === 'following' ? following : followers

    return (
        <div className={styles.tabContent}>
            {isSelf && onToggleVisibility && (
                <div className={styles.tabSectionHeader}>
                    <span className={styles.tabSectionTitle}><FaIcon name="users" /> 关注</span>
                    <PrivacyToggle level={visibility} onToggle={onToggleVisibility} />
                </div>
            )}
            <div className={styles.followsSubTabs}>
                <button
                    className={`${styles.followsSubTab} ${activeSubTab === 'following' ? styles.followsSubTabActive : ''}`}
                    onClick={() => onSubTabChange('following')}
                >
                    关注 ({following.length})
                </button>
                <button
                    className={`${styles.followsSubTab} ${activeSubTab === 'followers' ? styles.followsSubTabActive : ''}`}
                    onClick={() => onSubTabChange('followers')}
                >
                    粉丝 ({followers.length})
                </button>
            </div>

            <div className={styles.followsList}>
                {list.map(u => (
                    <a
                        key={u.id}
                        href={`${BASE_PATH}/user/mypage?user=${encodeURIComponent(u.id)}`}
                        className={styles.followUserCard}
                    >
                        <div className={styles.followUserCardBody}>
                            <UserName username={u.username} userId={u.id} link={false} />
                        </div>
                        <span className={styles.followDate}>
                            {formatDateShort(u.followed_at)}
                        </span>
                    </a>
                ))}
                {list.length === 0 && (
                    <div className={styles.followsEmpty}>
                        {activeSubTab === 'following' ? '还没有关注任何人' : '还没有粉丝'}
                    </div>
                )}
            </div>
        </div>
    )
}
