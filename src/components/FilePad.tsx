'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import type { NavNode } from '@/lib/navigation'
import WikiFilePad from './filepad/WikiFilePad'
import ForumFilePad from './filepad/ForumFilePad'
import NoticeFilePad from './filepad/NoticeFilePad'
import UserFilePad from './filepad/UserFilePad'
import AgreementFilePad from './filepad/AgreementFilePad'
import styles from '@/styles/filepad.module.css'

interface Props {
  tree: NavNode[]
}

export default function FilePad({ tree }: Props) {
  const pathname = usePathname()
  const visible = pathname !== '/'

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--filepad-width',
      visible ? '300px' : '0px',
    )
  }, [visible])

  if (!visible) return null

  const mode =
    pathname.startsWith('/wiki') ? 'wiki' :
    pathname.startsWith('/forum') ? 'forum' :
    pathname.startsWith('/notice') ? 'notice' :
    pathname.startsWith('/agreement') ? 'agreement' :
    pathname.startsWith('/user') ? 'user' : null

  return (
    <aside className={styles.filepad}>
      {mode === 'wiki' && <WikiFilePad tree={tree} />}
      {mode === 'forum' && <ForumFilePad />}
      {mode === 'notice' && <NoticeFilePad />}
      {mode === 'agreement' && <AgreementFilePad />}
      {mode === 'user' && <UserFilePad />}
    </aside>
  )
}
