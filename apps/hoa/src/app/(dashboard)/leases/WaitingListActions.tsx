'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MoreHorizontal, Undo2, XCircle } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
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

  // The confirm() modal MUST be awaited outside startTransition. Opening
  // it is a setState in ConfirmProvider; scheduled inside a transition
  // that is itself awaiting the modal's answer, React defers that commit
  // behind the in-flight action and the dialog never opens — the button
  // just greys out forever. Same reason the delete buttons moved to
  // <TwoClickDelete>. Confirm first, transition second.
  async function handleApprove() {
    const ok = await confirm({
      title: `Approve lease for ${propertyLabel}?`,
      description:
        "We'll mark the property as leased and record the approval in its history. This counts against the cap.",
      confirmLabel: 'Approve',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await approveWaitingListEntry(entryId)
      if (!result.ok) {
        toast({ tone: 'error', message: result.error })
        return
      }
      toast({ tone: 'success', message: `${propertyLabel} approved to lease.` })
      router.refresh()
    })
  }

  async function handleDeny() {
    const ok = await confirm({
      title: `Deny lease request for ${propertyLabel}?`,
      description:
        'The owner will need to be notified separately. This is recorded in the property history.',
      confirmLabel: 'Deny request',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
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

  async function handleWithdraw() {
    const ok = await confirm({
      title: `Withdraw ${propertyLabel} from the waiting list?`,
      description: "The owner can rejoin later if they're still interested.",
      confirmLabel: 'Withdraw',
    })
    if (!ok) return
    startTransition(async () => {
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
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="secondary" onClick={handleApprove} loading={pending} icon={<CheckCircle2 aria-hidden />}>
        Approve
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${propertyLabel}`} disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={<Undo2 aria-hidden />} onSelect={() => void handleWithdraw()}>
            Withdraw from list
          </DropdownMenuItem>
          <DropdownMenuItem destructive icon={<XCircle aria-hidden />} onSelect={() => void handleDeny()}>
            Deny request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
