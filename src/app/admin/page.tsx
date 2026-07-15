'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FaIcon from '@/components/FaIcon'
import { getSession } from '@/lib/auth'
import styles from '@/styles/admin.module.css'

export default function AdminPage() {
  const router = useRouter()
  const [session, setSession] = useState(getSession())
  const isAdmin = session && ['admin', 'super_admin'].includes(session.role)

  useEffect(() => {
    // 自动跳转到 revisions 页
    if (isAdmin) {
      router.replace('/admin/revisions')
    }
  }, [isAdmin, router])

  if (!session) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>请先登录</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <p className={styles.error}>无权限</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <p className={styles.loading}>跳转中…</p>
    </div>
  )
}
