'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession, tryRestoreSessionFromAuth, type UserSession } from '@/lib/auth'
import { fetchUserPendingRevision, fetchPendingRevisions } from '@/lib/wiki-api'
import styles from '@/styles/wiki-edit.module.css'

interface Props {
  slug: string
}

export default function WikiEditPanel({ slug }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)
  const [pending, setPending] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    // 始终尝试从 Supabase Auth 同步最新角色，覆盖可能过期的 localStorage session
    tryRestoreSessionFromAuth().then(() => setSession(getSession()))
  }, [])

  useEffect(() => {
    if (!slug || !session) return
    fetchUserPendingRevision(slug)
      .then((p) => setPending(!!p))
      .catch(() => {})
  }, [slug, session])

  useEffect(() => {
    if (!isAdmin) return
    fetchPendingRevisions()
      .then((list) => setPendingCount(list.filter((r) => r.slug === slug).length))
      .catch(() => {})
  }, [isAdmin, slug])

  if (!session || !slug) return null

  return (
    <div className={styles.editBtnContainer}>
      {/* 管理员：审核入口 → 跳转审核页 */}
      {isAdmin && (
        <button
          className={styles.reviewBtn}
          onClick={() => router.push('/admin/revisions')}
          title="管理待审核编辑"
        >
          <FaIcon name="gavel" />
          {pendingCount > 0 && (
            <span className={styles.reviewCount}>{pendingCount}</span>
          )}
        </button>
      )}

      {/* 当前用户的待审核标记 */}
      {pending && (
        <span className={styles.pendingBadge} title="你的编辑正在等待管理员审核">
          <FaIcon name="spinner" />
        </span>
      )}

      {/* 编辑按钮 → 跳转编辑页 */}
      <button
        className={styles.editBtn}
        onClick={() => router.push(`/wiki/edit?slug=${encodeURIComponent(slug)}`)}
        title={pending ? '继续编辑' : '编辑此页面'}
      >
        <FaIcon name="pen" />
      </button>
    </div>
  )
}
