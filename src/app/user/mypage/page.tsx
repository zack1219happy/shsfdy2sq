'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import { getPinyinInitials, loadPinyinInitialsFromDB } from '@/lib/people'
import { supabase } from '@/lib/supabase'
import type { UserSession } from '@/lib/auth'
import { HeaderBar } from './_components/HeaderBar'
import { StatsStrip } from './_components/StatsStrip'
import { HomeTab } from './_components/HomeTab'
import { PostsTab, ArticlesTab, FollowsTab } from './_components/ListTabs'
import { PacksTab } from './_components/PacksTab'
import type {
    Tab, FollowState, PrivacyLevel, PrivacySettings,
    DailyPoints, UserStats, ForumPostItem, PlazaArticleItem, FollowUser, UserProfile,
} from './_components/types'
import { UUID_RE } from './_components/types'
import styles from '@/styles/mypage.module.css'

/* ==============================================================
   用户主页 — 外层包裹 Suspense（useSearchParams 需要）
   ============================================================== */

export default function UserMypagePage() {
    return (
        <Suspense fallback={<div className={styles.loadingState}><FaIcon name="spinner" spin /> 加载中…</div>}>
            <UserMypage />
        </Suspense>
    )
}

function UserMypage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [session] = useState<UserSession | null>(getSession())
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [stats, setStats] = useState<UserStats | null>(null)
    const [dailyPoints, setDailyPoints] = useState<DailyPoints[]>([])
    const [followState, setFollowState] = useState<FollowState>('none')
    const [initials, setInitials] = useState('')
    const [privacy, setPrivacy] = useState<PrivacySettings>({
        heatmap: 'public', stats: 'public', posts: 'public', articles: 'public', follows: 'public',
    })

    // tab 数据
    const [posts, setPosts] = useState<ForumPostItem[]>([])
    const [articles, setArticles] = useState<PlazaArticleItem[]>([])
    const [followers, setFollowers] = useState<FollowUser[]>([])
    const [following, setFollowing] = useState<FollowUser[]>([])
    const [followsSubTab, setFollowsSubTab] = useState<'following' | 'followers'>('following')

    const [activeTab, setActiveTab] = useState<Tab>('home')
    const [tabLoading, setTabLoading] = useState(false)

    // 直接订阅 Next Router 的查询参数，确保同页 push/replace 和侧栏 Link 都能触发更新
    const urlUser = searchParams.get('user') || null
    const urlCommentId = searchParams.get('comment') || null
    const queryString = searchParams.toString()

    // 防止重复加载
    const loadedUserRef = useRef('')
    // 防止旧用户的异步请求在新用户页面上回写状态
    const profileRequestIdRef = useRef(0)

    // 初始化 session
    useEffect(() => {
        if (!session) { router.push('/'); return }
        loadPinyinInitialsFromDB()
    }, [router, session])

    const loadProfileData = useCallback(async (username: string) => {
        const requestId = profileRequestIdRef.current + 1
        profileRequestIdRef.current = requestId
        setLoading(true)
        setError('')
        // 重置 tab 数据
        setPosts([])
        setArticles([])
        setFollowers([])
        setFollowing([])
        try {
            // 1. 拉取基本信息（UUID → 按 ID 定位；否则按用户名，兼容旧链接）
            const isUuid = UUID_RE.test(username)
            const [profileRes] = await Promise.all([
                isUuid
                    ? supabase.rpc('get_user_profile_by_id', { p_user_id: username })
                    : supabase.rpc('get_user_profile', { p_username: username }),
                loadPinyinInitialsFromDB(),
            ])

            if (profileRequestIdRef.current !== requestId) return
            const p = (profileRes.data as UserProfile | null) ?? null
            if (!p) { setError('用户不存在'); setLoading(false); loadedUserRef.current = ''; return }
            setProfile(p)
            setPrivacy({
                heatmap: p.privacy_heatmap,
                stats: p.privacy_stats,
                posts: p.privacy_posts,
                articles: p.privacy_articles ?? 'public',
                follows: p.privacy_follows,
            })
            setInitials(getPinyinInitials(p.name ?? ''))

            // 2. 拉取统计数据 + 积分 + 关注状态
            const uid = p.id
            const [statsRes2, , followRes2] = await Promise.all([
                supabase.rpc('get_user_stats', { p_user_id: uid }),
                supabase.rpc('get_user_daily_points_from_tx', { p_user_id: uid, p_days: 14 }),
                supabase.rpc('get_follow_state', { p_target_username: p.username }),
            ])

            if (profileRequestIdRef.current !== requestId) return
            if (statsRes2.data) {
                const d = statsRes2.data as Record<string, number>
                setStats({
                    currentPoints: d.total_points ?? 0,
                    postsCount: d.posts_count ?? 0,
                    articlesCount: d.articles_count ?? 0,
                    commentsCount: d.comments_count ?? 0,
                    pageEditsCount: d.page_edits_count ?? 0,
                    wishesCount: d.wishes_count ?? 0,
                })
            }
            // 从 points_transactions 表按日聚合积分（user_points_daily 表可能为空）
            const { data: txData } = await supabase.rpc('get_user_daily_points_from_tx', { p_user_id: uid, p_days: 14 })
            if (profileRequestIdRef.current !== requestId) return
            if (txData) setDailyPoints((txData as { date: string; points: number }[]).map(d => ({ date: d.date.slice(5), points: d.points })))
            if (followRes2.data) setFollowState((followRes2.data as { state: FollowState }).state)

        } catch (e) {
            if (profileRequestIdRef.current !== requestId) return
            setError(e instanceof Error ? e.message : '加载失败')
        }
        if (profileRequestIdRef.current === requestId) setLoading(false)
    }, [])

    // URL 或 session 变化 → 加载数据
    useEffect(() => {
        if (!session) return
        const username = urlUser || session.username
        if (!username) return
        if (loadedUserRef.current === username) return
        loadedUserRef.current = username

        setProfile(null)
        setStats(null)
        setDailyPoints([])
        setFollowState('none')
        setPosts([])
        setArticles([])
        setFollowers([])
        setFollowing([])
        setActiveTab('home')
        setLoading(true)
        setError('')

        loadProfileData(username)
    }, [urlUser, session, loadProfileData])

    const loadPosts = useCallback(async (username: string) => {
        const requestKey = loadedUserRef.current
        const { data } = await supabase.rpc('get_user_forum_posts', { p_username: username, p_limit: 50, p_offset: 0 })
        if (loadedUserRef.current !== requestKey) return
        if (data) setPosts(data as ForumPostItem[])
    }, [])

    const loadArticles = useCallback(async (username: string) => {
        const requestKey = loadedUserRef.current
        try {
            const { data, error } = await supabase.rpc('get_user_plaza_articles', { p_username: username, p_limit: 50, p_offset: 0 })
            if (loadedUserRef.current !== requestKey) return
            if (error) {
                console.error('loadArticles error:', error)
                return
            }
            if (data) setArticles(data as PlazaArticleItem[])
        } catch (e) {
            console.error('loadArticles exception:', e)
        }
    }, [])

    const loadFollows = useCallback(async (username: string) => {
        const requestKey = loadedUserRef.current
        const [fingRes, fersRes] = await Promise.all([
            supabase.rpc('get_user_following', { p_username: username }),
            supabase.rpc('get_user_followers', { p_username: username }),
        ])
        if (loadedUserRef.current !== requestKey) return
        if (fingRes.data) setFollowing(fingRes.data as FollowUser[])
        if (fersRes.data) setFollowers(fersRes.data as FollowUser[])
    }, [])

    // tab 切换时加载对应数据
    const handleTabSelect = useCallback((tab: Tab) => {
        setActiveTab(tab)
        if (!profile) return
        const needsLoad =
            (tab === 'posts' && posts.length === 0) ||
            (tab === 'articles' && articles.length === 0) ||
            (tab === 'follows' && following.length === 0 && followers.length === 0)
        if (!needsLoad) return
        setTabLoading(true)
        const p = (() => {
            if (tab === 'posts') return loadPosts(profile.username)
            if (tab === 'articles') return loadArticles(profile.username)
            if (tab === 'follows') return loadFollows(profile.username)
            return Promise.resolve()
        })()
        p?.finally(() => setTabLoading(false))
    }, [profile, posts.length, articles.length, following.length, followers.length, loadPosts, loadArticles, loadFollows])

    const togglePrivacy = useCallback(async (section: keyof PrivacySettings) => {
        const cycle: PrivacyLevel[] = ['public', 'friends', 'private']
        const next = cycle[(cycle.indexOf(privacy[section]) + 1) % cycle.length] as PrivacyLevel
        setPrivacy(prev => ({ ...prev, [section]: next }))
        await supabase.rpc('update_privacy', { p_section: section, p_level: next })
    }, [privacy])

    const handleFollowToggle = useCallback(async () => {
        if (!profile) return
        if (followState === 'none') {
            const { data } = await supabase.rpc('follow_user', { p_target_username: profile.username })
            if ((data as { success: boolean })?.success) setFollowState('following')
        } else {
            const { data } = await supabase.rpc('unfollow_user', { p_target_username: profile.username })
            if ((data as { success: boolean })?.success) setFollowState('none')
        }
    }, [profile, followState])

    if (!session) return null
    const targetKey = urlUser || session.username
    const isSelf = !!profile && session.userId === profile.id

    return (
        <div className={styles.page}>
            {loading && !profile ? (
                <div className={styles.loadingState}>
                    <FaIcon name="spinner" spin /> 加载中…
                </div>
            ) : error ? (
                <div className={styles.errorState}>
                    <p>{error}</p>
                    <button className={styles.retryBtn} onClick={() => targetKey && loadProfileData(targetKey)}>重试</button>
                </div>
            ) : profile ? (
                <>
                    <HeaderBar
                        profile={profile}
                        initials={initials}
                        isSelf={isSelf}
                        followState={followState}
                        onFollowToggle={handleFollowToggle}
                    />

                    <div className={styles.bar}>
                        <div className={styles.tabs}>
                            <TabBtn tab="home"    label="用户主页" activeTab={activeTab} onSelect={handleTabSelect} />
                            <TabBtn tab="posts"   label="帖子"     activeTab={activeTab} onSelect={handleTabSelect} />
                            <TabBtn tab="articles" label="文章"   activeTab={activeTab} onSelect={handleTabSelect} />
                            <TabBtn tab="follows" label="关注"    activeTab={activeTab} onSelect={handleTabSelect} />
                            <TabBtn tab="packs" label="表情包"  activeTab={activeTab} onSelect={handleTabSelect} />
                        </div>
                        {stats && (
                            <div className={styles.barStatsWrap}>
                                <StatsStrip
                                    stats={stats}
                                    isSelf={isSelf}
                                    visibility={privacy.stats}
                                    onToggleVisibility={isSelf ? () => togglePrivacy('stats') : undefined}
                                />
                            </div>
                        )}
                    </div>

                    {activeTab === 'home' && (
                        <HomeTab
                            isSelf={isSelf}
                            profile={profile}
                            dailyPoints={dailyPoints}
                            privacy={privacy}
                            onTogglePrivacy={togglePrivacy}
                            stats={stats}
                            commentAnchorKey={urlCommentId ?? queryString}
                        />
                    )}
                    {activeTab === 'posts' && (
                        <PostsTab
                            posts={posts}
                            loading={tabLoading}
                            isSelf={isSelf}
                            visibility={privacy.posts}
                            onToggleVisibility={isSelf ? () => togglePrivacy('posts') : undefined}
                        />
                    )}
                    {activeTab === 'articles' && (
                        <ArticlesTab
                            articles={articles}
                            loading={tabLoading}
                            isSelf={isSelf}
                            visibility={privacy.articles}
                            onToggleVisibility={isSelf ? () => togglePrivacy('articles') : undefined}
                        />
                    )}
                    {activeTab === 'packs' && (
                        <PacksTab username={profile.username} isSelf={isSelf} />
                    )}
                    {activeTab === 'follows' && (
                        <FollowsTab
                            following={following}
                            followers={followers}
                            loading={tabLoading}
                            isSelf={isSelf}
                            visibility={privacy.follows}
                            onToggleVisibility={isSelf ? () => togglePrivacy('follows') : undefined}
                            activeSubTab={followsSubTab}
                            onSubTabChange={setFollowsSubTab}
                        />
                    )}
                </>
            ) : null}
        </div>
    )
}

function TabBtn({ tab, label, activeTab, onSelect }: {
    tab: Tab; label: string; activeTab: Tab; onSelect: (t: Tab) => void
}) {
    return (
        <button
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => onSelect(tab)}
        >
            {label}
        </button>
    )
}
