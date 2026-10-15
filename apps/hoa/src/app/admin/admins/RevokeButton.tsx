'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useConfirm } from '@homeowner-portal/ui'
import { revokePlatformAdmin } from '@/lib/platform-admin'

export function RevokeButton({ userId, email }: { userId: string; email: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const confirm = useConfirm()

  async function handleClick() {
    const ok = await confirm({
      title: 'Revoke platform-admin access?',
      description: `${email} will lose access to every platform-admin tool immediately.`,
      confirmLabel: 'Revoke access',
      destructive: true,
    })
    if (!ok) return
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
