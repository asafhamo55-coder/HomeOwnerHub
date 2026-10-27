'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@homeowner-portal/ui'
import { acceptProfessionalInvite } from '@/lib/professionals/invites'

export function AcceptInviteButton({ inviteId, sig }: { inviteId: string; sig: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await acceptProfessionalInvite(inviteId, sig)
            if (!r.ok) return setError(r.error)
            router.push('/pro')
          })
        }
      >
        Accept invitation
      </Button>
    </div>
  )
}
