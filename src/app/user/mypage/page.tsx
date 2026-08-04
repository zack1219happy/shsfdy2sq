'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import { UserName } from '@/components/UserName'
import WikiContent from '@/components/WikiContent'
import MessageBoard from '@/components/MessageBoard'
import { getSession } from '@/lib/auth'
import { getPinyinInitials, loadPinyinInitialsFromDB } from '@/lib/people'
import { supabase } from '@/lib/supabase'
import { BASE_PATH } from '@/lib/constants'
import type { UserSession } from '@/lib/auth'
import styles from '@/styles/mypage.module.css'

/* ==============================================================
   MarkdownEditor — dynamic import（SSR 禁用，加 loading 防 chunk 错误）
   ============================================================== */

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
  { ssr: false, loading: () => <div className={styles.editorLoading}>加载编辑器…</div> },
)

/* ==============================================================
   类型定义
   ============================================================== */

type Tab = 'home' | 'posts' | 'articles' | 'follows'
type FollowState = 'none' | 'following' | 'mutual'
type PrivacyLevel = 'public' | 'friends' | 'private'

interface PrivacySettings {
  heatmap: PrivacyLevel
  stats: PrivacyLevel
  posts: PrivacyLevel
  articles: PrivacyLevel
  follows: PrivacyLevel
}

interface DailyPoints {
  date: string
  points: number
}

interface UserStats {
  currentPoints: number
  postsCount: number
  articlesCount: number
  commentsCount: number
  pageEditsCount: number
  wishesCount: number
}

interface ForumPostItem {
  id: string
  title: string
  content: string
  created_at: string
  upvotes: number
  downvotes: number
  comment_count: number
}

interface PlazaArticleItem {
  id: string
  title: string
  content: string
  slug: string
  created_at: string
  upvote_count: number
  downvote_count: number
  comment_count: number
  is_public: boolean
}

interface FollowUser {
  id: string
  username: string
  name: string
  color: string | null
  followed_at: string
}

interface UserProfile {
  id: string
  username: string
  name: string
  role: string
  student_id: string
  motto: string
  bio: string
  color: string | null
  equipped_tags: unknown[]
  total_points: number
  privacy_heatmap: PrivacyLevel
  privacy_stats: PrivacyLevel
  privacy_posts: PrivacyLevel
  privacy_articles?: PrivacyLevel
  privacy_follows: PrivacyLevel
}

/* ==============================================================
   工具
   ============================================================== */

/** 判断字符串是否为 UUID（用户主页 URL 参数按此区分 ID / 用户名） */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/* ==============================================================
   热力图等级 (0–5)
   ============================================================== */

function getHeatmapLevel(points: number): number {
  if (points === 0) return 0
  if (points <= 2) return 1
  if (points <= 6) return 2
  if (points <= 12) return 3
  if (points <= 24) return 4
  return 5
}

/* ==============================================================
   UserMypage — 外层包裹 Suspense（useSearchParams 需要）
   ============================================================== */

export default function UserMypagePage() {
  return (
    <Suspense fallback={<div className={styles.loadingState}><FaIcon name="spinner" spin /> 加载中…</div>}>
      <UserMypage />
    </Suspense>
  )
}

/* ==============================================================
   UserMypage — 主组件
   ============================================================== */

function UserMypage() {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)
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

  // 同步 URL query（与 DM 页相同模式，useSearchParams 在同页面导航时不可靠）
  const [activeQuery, setActiveQuery] = useState('')
  useEffect(() => {
    const sync = () => setActiveQuery(window.location.search)
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('mypage-route-change', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('mypage-route-change', sync)
    }
  }, [])
  const urlUser = useMemo(() => {
    // 优先从 activeQuery（事件驱动更新），首次渲染时可能为空，备选直读 URL
    const q = activeQuery || (typeof window !== 'undefined' ? window.location.search : '')
    return new URLSearchParams(q).get('user') || null
  }, [activeQuery])

  // 通知跳转锚点：URL 中 comment id → 滚动到对应留言
  const urlCommentId = useMemo(() => {
    const q = activeQuery || (typeof window !== 'undefined' ? window.location.search : '')
    return new URLSearchParams(q).get('comment') || null
  }, [activeQuery])

  // 防止重复加载
  const loadedUserRef = useRef('')

  // 初始化 session
  useEffect(() => {
    const s = getSession()
    if (!s) { router.push('/'); return }
    setSession(s)
    loadPinyinInitialsFromDB()
  }, [router])

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
  }, [urlUser, session])

  const loadProfileData = useCallback(async (username: string) => {
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
      const [profileRes, pinyinMap] = await Promise.all([
        isUuid
          ? supabase.rpc('get_user_profile_by_id', { p_user_id: username })
          : supabase.rpc('get_user_profile', { p_username: username }),
        loadPinyinInitialsFromDB(),
      ])

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
      const [statsRes2, pointsRes2, followRes2] = await Promise.all([
        supabase.rpc('get_user_stats', { p_user_id: uid }),
        supabase.rpc('get_user_daily_points_from_tx', { p_user_id: uid, p_days: 14 }),
        supabase.rpc('get_follow_state', { p_target_username: p.username }),
      ])

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
      if (txData) setDailyPoints((txData as { date: string; points: number }[]).map(d => ({ date: d.date.slice(5), points: d.points })))
      if (followRes2.data) setFollowState((followRes2.data as { state: FollowState }).state)

    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
    setLoading(false)
  }, [])

  const loadPosts = useCallback(async (username: string) => {
    const { data } = await supabase.rpc('get_user_forum_posts', { p_username: username, p_limit: 50, p_offset: 0 })
    if (data) setPosts(data as ForumPostItem[])
  }, [])

  const loadArticles = useCallback(async (username: string) => {
    try {
      const { data, error } = await supabase.rpc('get_user_plaza_articles', { p_username: username, p_limit: 50, p_offset: 0 })
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
    const [fingRes, fersRes] = await Promise.all([
      supabase.rpc('get_user_following', { p_username: username }),
      supabase.rpc('get_user_followers', { p_username: username }),
    ])
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
            session={session}
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
              targetCommentId={urlCommentId}
              scrollKey={urlCommentId ? urlCommentId.length : 0}
            />
          )}
          {activeTab === 'posts' && (
            <PostsTab
              posts={posts}
              loading={tabLoading}
              isSelf={isSelf}
              visibility={privacy.posts}
              onToggleVisibility={isSelf ? () => togglePrivacy('posts') : undefined}
              profile={profile}
              session={session}
            />
          )}
          {activeTab === 'articles' && (
            <ArticlesTab
              articles={articles}
              loading={tabLoading}
              isSelf={isSelf}
              visibility={privacy.articles}
              onToggleVisibility={isSelf ? () => togglePrivacy('articles') : undefined}
              profile={profile}
              session={session}
            />
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

/* ==============================================================
   TabBtn
   ============================================================== */

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

/* ==============================================================
   HeaderBar — 灰色衬底头部
   ============================================================== */

function HeaderBar({
  session, profile, initials, isSelf, followState, onFollowToggle,
}: {
  session: UserSession
  profile: UserProfile
  initials: string
  isSelf: boolean
  followState: FollowState
  onFollowToggle: () => void
}) {
  const [motto, setMotto] = useState(profile.motto)
  const [editingMotto, setEditingMotto] = useState(false)
  const [mottoDraft, setMottoDraft] = useState(profile.motto)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // sync from profile
  useEffect(() => {
    setMotto(profile.motto)
    setMottoDraft(profile.motto)
  }, [profile.motto])

  const handleStartEdit = useCallback(() => {
    setMottoDraft(motto)
    setEditingMotto(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [motto])

  const handleSaveMotto = useCallback(async () => {
    const trimmed = mottoDraft.trim()
    if (trimmed) {
      setMotto(trimmed)
      await supabase.rpc('update_motto', { p_motto: trimmed })
    }
    setEditingMotto(false)
  }, [mottoDraft, motto])

  const handleCancelMotto = useCallback(() => {
    setMottoDraft(motto)
    setEditingMotto(false)
  }, [motto])

  // 学号 → 届数色
  const sDigits = (profile.student_id ?? '').replace(/\D/g, '')
  const sNum = sDigits.length <= 2 ? parseInt(sDigits, 10) : parseInt(sDigits.slice(-2), 10)
  const badgeColor = sNum >= 1 && sNum <= 5 ? '#e88d9e'
    : sNum >= 51 && sNum <= 70 ? '#4a90d9'
    : '#999'

  return (
    <div className={styles.headerBg}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <div className={styles.userNameRow}>
            <UserName username={profile.username} userId={profile.id} link={false} />
          </div>
          <div className={styles.mottoRow}>
            {editingMotto ? (
              <div className={styles.mottoEditArea}>
                <span className={styles.initials} style={{ background: badgeColor }}>{initials}</span>
                <input
                  ref={inputRef}
                  className={styles.mottoInput}
                  type="text" maxLength={60}
                  value={mottoDraft}
                  onChange={e => setMottoDraft(e.target.value)}
                  onBlur={handleSaveMotto}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveMotto()
                    if (e.key === 'Escape') handleCancelMotto()
                  }}
                  placeholder="写一句座右铭…"
                />
                <button className={styles.mottoEditAction} onClick={handleSaveMotto} title="保存">
                  <FaIcon name="check" />
                </button>
                <button className={styles.mottoEditAction} onClick={handleCancelMotto} title="取消">
                  <FaIcon name="times" />
                </button>
              </div>
            ) : (
              <>
                <span className={styles.initials} style={{ background: badgeColor }}>{initials}</span>
                <span className={styles.mottoText}>
                  {motto || '还没有座右铭'}
                </span>
                {isSelf && (
                  <button className={styles.mottoEditBtn} onClick={handleStartEdit} title="编辑座右铭">
                    <FaIcon name="pen" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className={styles.headerRight}>
          {/* 私信：仅查看他人主页时显示 */}
          {!isSelf && (
            <DmButton targetUserId={profile.id} router={router} />
          )}
          {/* 关注/取消关注：仅查看他人主页时显示 */}
          {!isSelf && (
            <button
              className={`${styles.actionBtn} ${
                followState === 'none' ? styles.followBtn : styles.followBtnActive
              }`}
              onClick={onFollowToggle}
            >
              {followState === 'none' && <>+ 关注</>}
              {followState === 'following' && <><FaIcon name="check" /> 已关注</>}
              {followState === 'mutual' && <><FaIcon name="check" /> 互相关注</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ==============================================================
   DmButton — 私信按钮，先查已有对话，有则跳 conv，无则用 user=
   ============================================================== */

function DmButton({ targetUserId, router }: { targetUserId: string; router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState(false)

  const handleClick = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const { data: convs } = await supabase.rpc('get_conversations')
      const conv = (convs as any[])?.find(c => c.other_user_id === targetUserId)
      if (conv) {
        router.push(`/dm?conv=${conv.conversation_id}`)
      } else {
        router.push(`/dm?user=${targetUserId}`)
      }
    } catch {
      router.push(`/dm?user=${targetUserId}`)
    }
  }, [targetUserId, router, busy])

  return (
    <button
      className={`${styles.actionBtn} ${styles.dmBtn}`}
      onClick={handleClick}
      disabled={busy}
    >
      <FaIcon name="envelope" /> {busy ? '…' : '私信'}
    </button>
  )
}

/* ==============================================================
   StatsStrip — tab 栏同行的统计条
   ============================================================== */

function StatsStrip({
  stats, isSelf, visibility, onToggleVisibility,
}: {
  stats: UserStats
  isSelf: boolean
  visibility: PrivacyLevel
  onToggleVisibility?: () => void
}) {
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

/* ==============================================================
   HomeTab — "用户主页" tab 内容
   ============================================================== */

function HomeTab({
  isSelf, profile, dailyPoints, privacy, onTogglePrivacy, stats, targetCommentId, scrollKey,
}: {
  isSelf: boolean
  profile: UserProfile
  dailyPoints: DailyPoints[]
  privacy: PrivacySettings
  onTogglePrivacy: (section: keyof PrivacySettings) => void
  stats: UserStats | null
  targetCommentId: string | null
  scrollKey: number
}) {
  return (
    <div className={styles.tabContent}>
      {stats && (
        <div className={styles.homeStatsWrap}>
          <StatsStrip
            stats={stats}
            isSelf={isSelf}
            visibility={privacy.stats}
            onToggleVisibility={isSelf ? () => onTogglePrivacy('stats') : undefined}
          />
        </div>
      )}
      <HeatmapWidget
        dailyPoints={dailyPoints}
        isSelf={isSelf}
        visibility={privacy.heatmap}
        onToggleVisibility={isSelf ? () => onTogglePrivacy('heatmap') : undefined}
      />
      <BioSection isSelf={isSelf} bio={profile.bio} />

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>
          <FaIcon name="comments" /> 留言板
        </h3>
        <MessageBoard
          targetUserId={profile.id}
          targetCommentId={targetCommentId}
          scrollKey={scrollKey}
        />
      </section>
    </div>
  )
}

/* ==============================================================
   HeatmapWidget — 最近两周积分热力图
   ============================================================== */

function HeatmapWidget({
  dailyPoints, isSelf, visibility, onToggleVisibility,
}: {
  dailyPoints: DailyPoints[]
  isSelf: boolean
  visibility: PrivacyLevel
  onToggleVisibility?: () => void
}) {
  const totalWeekly = dailyPoints.reduce((sum, d) => sum + d.points, 0)

  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}>
        <FaIcon name="star" /> 最近两周积分
        {isSelf && onToggleVisibility && (
          <PrivacyToggle level={visibility} onToggle={onToggleVisibility} />
        )}
      </h3>
      <div className={styles.heatmapGrid}>
        {dailyPoints.length === 0 ? (
          <div className={styles.heatmapEmpty}>暂无数据</div>
        ) : (
          dailyPoints.map((day, i) => {
            const level = getHeatmapLevel(day.points)
            const maxPoints = Math.max(...dailyPoints.map(d => d.points), 1)
            const heightPercent = Math.max(8, (day.points / maxPoints) * 48)
            return (
              <div key={i} className={styles.heatmapCol} title={`${day.date} · ${day.points} 积分`}>
                <div
                  className={`${styles.heatmapBar} ${styles[`heatmapLevel${level}`]}`}
                  style={{ height: heightPercent }}
                />
                <span className={styles.heatmapDate}>{day.date}</span>
              </div>
            )
          })
        )}
      </div>
      <div className={styles.heatmapLegend}>
        <span>少</span>
        {[0, 1, 2, 3, 4, 5].map(l => (
          <span key={l} className={`${styles.legendSwatch} ${styles[`heatmapLevel${l}`]}`} />
        ))}
        <span>多</span>
        <span className={styles.heatmapTotal}>近两周共 {totalWeekly} 积分</span>
      </div>
    </section>
  )
}

/* ==============================================================
   BioSection — 自我介绍
   ============================================================== */

function BioSection({ isSelf, bio: initialBio }: { isSelf: boolean; bio: string }) {
  const [bio, setBio] = useState(initialBio)
  const [editing, setEditing] = useState(false)
  const [draftBio, setDraftBio] = useState(initialBio)

  useEffect(() => { setBio(initialBio); setDraftBio(initialBio) }, [initialBio])

  const handleStartEdit = useCallback(() => {
    setDraftBio(bio)
    setEditing(true)
  }, [bio])

  const handleSave = useCallback(async () => {
    setBio(draftBio)
    setEditing(false)
    await supabase.rpc('update_bio', { p_bio: draftBio })
  }, [draftBio])

  const handleCancel = useCallback(() => {
    setDraftBio(bio)
    setEditing(false)
  }, [bio])

  if (editing) {
    return (
      <section className={styles.bioSection}>
        <div className={styles.bioHeader}>
          <h3 className={styles.cardTitle}>
            <FaIcon name="pen" /> 自我介绍
          </h3>
          <div className={styles.bioEditActions}>
            <button className={styles.saveBtn} onClick={handleSave}>
              <FaIcon name="check" /> 保存
            </button>
            <button className={styles.cancelBtn} onClick={handleCancel}>
              <FaIcon name="times" /> 取消
            </button>
          </div>
        </div>
        <div className={styles.editorWrapper}>
          <MarkdownEditor
            value={draftBio}
            onChange={setDraftBio}
            config={{ preview: true, fullScreen: false }}
          />
        </div>
      </section>
    )
  }

  return (
    <section className={styles.bioSection}>
      <div className={styles.bioHeader}>
        <h3 className={styles.cardTitle}>
          <FaIcon name="pen" /> 自我介绍
        </h3>
        {isSelf && (
          <button className={styles.bioEditBtn} onClick={handleStartEdit} title="编辑自我介绍">
            <FaIcon name="pen" />
          </button>
        )}
      </div>
      {bio ? (
        <div className={styles.bioContent}>
          <WikiContent content={bio} className="wiki-body" format="markdown" />
        </div>
      ) : (
        <div className={styles.bioEmpty}>
          这个人很懒，还没有留下足迹
        </div>
      )}
    </section>
  )
}

/* ==============================================================
   PostsTab — 帖子列表
   ============================================================== */

function PostsTab({
  posts, loading, isSelf, visibility, onToggleVisibility, profile, session,
}: {
  posts: ForumPostItem[]
  loading?: boolean
  isSelf: boolean
  visibility: PrivacyLevel
  onToggleVisibility?: () => void
  profile: UserProfile
  session: UserSession
}) {
  // 非自己且非公开 → 检查互关
  const canView = isSelf || visibility === 'public'

  if (!canView) {
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
            <span className={styles.listCardDate}>{formatDate(post.created_at)}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

/* ==============================================================
   ArticlesTab — 文章列表
   ============================================================== */

function ArticlesTab({
  articles, loading, isSelf, visibility, onToggleVisibility, profile, session,
}: {
  articles: PlazaArticleItem[]
  loading?: boolean
  isSelf: boolean
  visibility: PrivacyLevel
  onToggleVisibility?: () => void
  profile: UserProfile
  session: UserSession
}) {
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
            <span className={styles.listCardDate}>{formatDate(article.created_at)}</span>
          </div>
        </a>
      ))}
    </div>
  )
}

/* ==============================================================
   FollowsTab — 关注/粉丝
   ============================================================== */

function FollowsTab({
  following, followers, loading, isSelf, visibility, onToggleVisibility, activeSubTab, onSubTabChange,
}: {
  following: FollowUser[]
  followers: FollowUser[]
  loading?: boolean
  isSelf: boolean
  visibility: PrivacyLevel
  onToggleVisibility?: () => void
  activeSubTab: 'following' | 'followers'
  onSubTabChange: (t: 'following' | 'followers') => void
}) {
  const canView = isSelf || visibility === 'public'

  if (!canView) {
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
              {formatDate(u.followed_at)}
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

/* ==============================================================
   PrivacyToggle — 可见性切换图标
   ============================================================== */

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

function PrivacyToggle({ level, onToggle }: {
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

/* ==============================================================
   辅助函数
   ============================================================== */

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}
