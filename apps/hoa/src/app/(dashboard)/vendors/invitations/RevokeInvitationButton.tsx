'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { revokeInvitation } from '@/lib/vendor-invitations'

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const ok = await confirm({
      title: 'Revoke this invitation?',
      description: 'The link will stop working. You can re-invite later if needed.',
      confirmLabel: 'Revoke',
      destructive: true,
    })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const result = await revokeInvitation(invitationId)
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Invitation revoked.' })
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
