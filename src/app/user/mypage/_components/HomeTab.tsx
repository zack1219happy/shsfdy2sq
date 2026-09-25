'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import FaIcon from '@/components/FaIcon'
import WikiContent from '@/components/WikiContent'
import CommentSection from '@/components/CommentSection'
import { supabase } from '@/lib/supabase'
import { getHeatmapLevel, type DailyPoints, type PrivacyLevel, type PrivacySettings, type UserProfile, type UserStats } from './types'
import { StatsStrip, PrivacyToggle } from './StatsStrip'
import styles from '@/styles/mypage.module.css'

const MarkdownEditor = dynamic(
    () => import('@/components/MarkdownEditor').then((m) => m.MarkdownEditor),
    { ssr: false, loading: () => <div className={styles.editorLoading}>加载编辑器…</div> },
)

/** "用户主页" tab 内容 */
export function HomeTab({
    isSelf, isMutual, profile, dailyPoints, privacy, onTogglePrivacy, stats, commentAnchorKey,
}: {
    isSelf: boolean
    isMutual: boolean
    profile: UserProfile
    dailyPoints: DailyPoints[]
    privacy: PrivacySettings
    onTogglePrivacy: (section: keyof PrivacySettings) => void
    stats: UserStats | null
    /** URL 变化信号：评论组件据此重扫 ?comment= 锚点 */
    commentAnchorKey?: string
}) {
    return (
        <div className={styles.tabContent}>
            {stats && (
                <div className={styles.homeStatsWrap}>
                    <StatsStrip
                        stats={stats}
                        isSelf={isSelf}
                        isMutual={isMutual}
                        visibility={privacy.stats}
                        onToggleVisibility={isSelf ? () => onTogglePrivacy('stats') : undefined}
                    />
                </div>
            )}
            <HeatmapWidget
                dailyPoints={dailyPoints}
                isSelf={isSelf}
                isMutual={isMutual}
                visibility={privacy.heatmap}
                onToggleVisibility={isSelf ? () => onTogglePrivacy('heatmap') : undefined}
            />
            <BioSection isSelf={isSelf} bio={profile.bio} />

            <section className={styles.card}>
                <CommentSection
                    source="user_page"
                    targetId={profile.id}
                    title="留言板"
                    embedded
                    scrollKey={commentAnchorKey}
                />
            </section>
        </div>
    )
}

/** 最近两周积分热力图 */
function HeatmapWidget({
    dailyPoints, isSelf, isMutual, visibility, onToggleVisibility,
}: {
    dailyPoints: DailyPoints[]
    isSelf: boolean
    isMutual: boolean
    visibility: PrivacyLevel
    onToggleVisibility?: () => void
}) {
    if (!isSelf && visibility !== 'public' && !(visibility === 'friends' && isMutual)) return null

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

/** 自我介绍（Markdown，可编辑） */
function BioSection({ isSelf, bio: initialBio }: { isSelf: boolean; bio: string }) {
    const [bio, setBio] = useState(initialBio)
    const [editing, setEditing] = useState(false)
    const [draftBio, setDraftBio] = useState(initialBio)
    const [prevBio, setPrevBio] = useState(initialBio)

    // 渲染期调整，避免在 effect 中同步 setState
    if (prevBio !== initialBio) {
        setPrevBio(initialBio)
        setBio(initialBio)
        setDraftBio(initialBio)
    }

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
