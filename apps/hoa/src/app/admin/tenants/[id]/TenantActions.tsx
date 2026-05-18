'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Pause } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { suspendTenant, resumeTenant } from '@/lib/platform-admin'

export function TenantActions({
  orgId,
  suspendedAt,
}: {
  orgId: string
  suspendedAt: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSuspend() {
    const reason = window.prompt('Suspension reason (optional, for audit log):') ?? null
    if (
      !window.confirm(
        'Suspend this tenant? They will not be able to sign in until you resume them. The action is logged.',
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const result = await suspendTenant(orgId, reason)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleResume() {
    if (!window.confirm('Resume this tenant?')) return
    setError(null)
    startTransition(async () => {
      const result = await resumeTenant(orgId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {suspendedAt ? (
        <Button size="sm" onClick={handleResume} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" />
          {isPending ? 'Resuming…' : 'Resume tenant'}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={handleSuspend} disabled={isPending}>
          <Pause className="h-4 w-4" />
          {isPending ? 'Suspending…' : 'Suspend tenant'}
        </Button>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
