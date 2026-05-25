'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, CheckCircle2, Pause, RotateCcw } from 'lucide-react'
import { Button, useConfirm } from '@homeowner-portal/ui'
import {
  suspendTenant,
  resumeTenant,
  archiveTenant,
  restoreTenant,
} from '@/lib/platform-admin'

export function TenantActions({
  orgId,
  orgName,
  suspendedAt,
  archivedAt,
}: {
  orgId: string
  orgName: string
  suspendedAt: string | null
  archivedAt: string | null
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleSuspend() {
    const ok = await confirm({
      title: `Suspend "${orgName}"?`,
      description:
        'Members of this tenant will not be able to sign in until you resume them. This action is logged in the audit trail.',
      confirmLabel: 'Suspend tenant',
      destructive: true,
    })
    if (!ok) return

    setError(null)
    startTransition(async () => {
      const result = await suspendTenant(orgId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  async function handleResume() {
    const ok = await confirm({
      title: `Resume "${orgName}"?`,
      description: 'This will re-enable sign-in for all members of this tenant.',
      confirmLabel: 'Resume tenant',
    })
    if (!ok) return

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

  async function handleArchive() {
    const first = await confirm({
      title: `Archive "${orgName}"?`,
      description:
        'Archiving hides this tenant from active lists and blocks all member sign-ins. Their data will be preserved and you can restore them later.',
      confirmLabel: 'Continue to archive',
      destructive: true,
    })
    if (!first) return

    const second = await confirm({
      title: 'Are you absolutely sure?',
      description: `You are about to archive "${orgName}". All members will immediately lose access. This is reversible — a platform admin can restore the tenant later.`,
      confirmLabel: 'Yes, archive this tenant',
      cancelLabel: 'Go back',
      destructive: true,
    })
    if (!second) return

    setError(null)
    startTransition(async () => {
      const result = await archiveTenant(orgId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  async function handleRestore() {
    const ok = await confirm({
      title: `Restore "${orgName}"?`,
      description:
        'This will un-archive the tenant, re-enable sign-in for all members, and make it visible in active lists again.',
      confirmLabel: 'Restore tenant',
    })
    if (!ok) return

    setError(null)
    startTransition(async () => {
      const result = await restoreTenant(orgId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  if (archivedAt) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" onClick={handleRestore} disabled={isPending}>
          <RotateCcw className="h-4 w-4" />
          {isPending ? 'Restoring…' : 'Restore tenant'}
        </Button>
        {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
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
        <Button variant="destructive" size="sm" onClick={handleArchive} disabled={isPending}>
          <Archive className="h-4 w-4" />
          {isPending ? 'Archiving…' : 'Archive tenant'}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}
