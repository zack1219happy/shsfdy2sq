'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession, tryRestoreSessionFromAuth, type UserSession } from '@/lib/auth'
import styles from '@/styles/wiki-edit.module.css'

interface Props {
  slug: string
}

export default function AgreementEditPanel({ slug }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)

  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    tryRestoreSessionFromAuth().then(() => setSession(getSession()))
  }, [])

  if (!session || !isAdmin) return null

  return (
    <div className={styles.editBtnContainer}>
      <button
        className={styles.editBtn}
        onClick={() => router.push(`/agreement/edit?slug=${encodeURIComponent(slug)}`)}
        title="编辑此页面"
      >
        <FaIcon name="pen" />
      </button>
    </div>
  )
}
