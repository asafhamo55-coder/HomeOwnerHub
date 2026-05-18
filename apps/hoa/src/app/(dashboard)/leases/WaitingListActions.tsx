'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Undo2 } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import {
  approveWaitingListEntry,
  denyWaitingListEntry,
  withdrawWaitingListEntry,
} from '@/lib/leases'

export function WaitingListActions({
  entryId,
  propertyLabel,
}: {
  entryId: string
  propertyLabel: string
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Approve lease for ${propertyLabel}?`,
        description:
          "We'll mark the property as leased and record the approval in its history. This counts against the cap.",
        confirmLabel: 'Approve',
      })
      if (!ok) return
      const result = await approveWaitingListEntry(entryId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${propertyLabel} approved to lease.` })
      router.refresh()
    })
  }

  function handleDeny() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Deny lease request for ${propertyLabel}?`,
        description:
          'The owner will need to be notified separately. This is recorded in the property history.',
        confirmLabel: 'Deny request',
        destructive: true,
      })
      if (!ok) return
      // Reason capture happens elsewhere (or via property notes). v1
      // takes a generic "denied by board" reason — extend with a prompt
      // when product feedback asks for it.
      const result = await denyWaitingListEntry(entryId, 'Denied by board.')
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${propertyLabel} denied.` })
      router.refresh()
    })
  }

  function handleWithdraw() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Withdraw ${propertyLabel} from the waiting list?`,
        description: "The owner can rejoin later if they're still interested.",
        confirmLabel: 'Withdraw',
      })
      if (!ok) return
      const result = await withdrawWaitingListEntry(entryId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${propertyLabel} withdrawn.` })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={handleApprove} disabled={pending}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={handleDeny}
        disabled={pending}
      >
        <XCircle className="h-3.5 w-3.5" />
        Deny
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleWithdraw}
        disabled={pending}
      >
        <Undo2 className="h-3.5 w-3.5" />
        Withdraw
      </Button>
    </div>
  )
}
