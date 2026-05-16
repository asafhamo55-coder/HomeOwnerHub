'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@homeowner-portal/ui'
import { revokeInvitation } from '@/lib/vendor-invitations'

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm('Revoke this invitation? The link will stop working.')) return
    setError(null)
    startTransition(async () => {
      const result = await revokeInvitation(invitationId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Revoking…' : 'Revoke'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
