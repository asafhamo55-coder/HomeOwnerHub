'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@homeowner-portal/ui'
import { revokePlatformAdmin } from '@/lib/platform-admin'

export function RevokeButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (!window.confirm(`Revoke platform-admin access from ${email}?`)) return
    setError(null)
    startTransition(async () => {
      const result = await revokePlatformAdmin(userId)
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
        {isPending ? '…' : 'Revoke'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
