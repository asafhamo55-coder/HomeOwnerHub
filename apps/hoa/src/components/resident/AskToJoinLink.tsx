import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { M5_APPLIED } from '@homeowner-portal/db/m5'

// BL-143: the way out of "No home linked yet". With M5_APPLIED off this
// renders nothing and the empty state reads exactly as before.

export function AskToJoinLink({ live = M5_APPLIED, size = 'md' }: { live?: boolean; size?: 'sm' | 'md' }) {
  if (!live) return null
  return (
    <Button asChild size={size} variant="secondary" icon={<UserPlus aria-hidden />}>
      <Link href="/join">Ask to join</Link>
    </Button>
  )
}
