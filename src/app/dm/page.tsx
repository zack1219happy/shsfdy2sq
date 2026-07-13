import { Suspense } from 'react'
import DmPageInner from './DmPageInner'

export default function DmPage() {
  return (
    <Suspense fallback={<div className="dmPageShell" />}>
      <DmPageInner />
    </Suspense>
  )
}
