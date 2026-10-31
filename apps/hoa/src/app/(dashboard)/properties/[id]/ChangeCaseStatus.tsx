'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ConfirmDialog, Textarea, useToast } from '@homeowner-portal/ui'
import { setCollectionStatus } from '@/lib/collections/actions'
import type { CollectionStatus } from '@/lib/collections/statuses'

/**
 * "Change case status" for board/admin: close an open case as resolved or
 * written off, or reopen a closed one. Each choice asks for a short reason,
 * which is kept on the case and in its activity log.
 *
 * Status and audit only. Writing a case off here does not touch the ledger,
 * post a charge or send anything.
 */
const CLOSE_COPY: Record<'resolved' | 'written_off', { trigger: string; title: string; description: string; confirm: string }> = {
  resolved: {
    trigger: 'Resolved (paid)',
    title: 'Mark this case resolved?',
    description: 'The balance has been settled. The case leaves the open cases list and keeps today’s date as its close date.',
    confirm: 'Mark resolved',
  },
  written_off: {
    trigger: 'Written off',
    title: 'Write off this case?',
    description:
      'The board has stopped pursuing it. This records the decision only. It does not change the owner’s ledger balance or send anything.',
    confirm: 'Write off case',
  },
}

function ReasonDialog({
  caseId,
  status,
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
}: {
  caseId: string
  status: CollectionStatus
  trigger: string
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [reason, setReason] = useState('')

  async function submit() {
    const result = await setCollectionStatus({ caseId, status, closedReason: reason })
    if (!result.ok) {
      toast({ tone: 'error', title: 'Couldn’t change the status', message: result.error })
      // Throwing keeps the dialog open so the reason isn't lost.
      throw new Error('status change failed')
    }
    toast({ tone: 'success', message: 'Case status updated.' })
    setReason('')
    router.refresh()
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" size="sm">
          {trigger}
        </Button>
      }
      title={title}
      description={
        <span className="block space-y-3">
          <span className="block">{description}</span>
          <label className="block space-y-1">
            <span className="block text-sm font-medium text-foreground">Reason (required)</span>
            <Textarea
              name="statusReason"
              rows={2}
              maxLength={500}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Paid in full by check 1042"
            />
          </label>
        </span>
      }
      confirmLabel={confirmLabel}
      destructive={destructive}
      onConfirm={submit}
    />
  )
}

export function ChangeCaseStatus({ caseId, mode }: { caseId: string; mode: 'close' | 'reopen' }) {
  if (mode === 'reopen') {
    return (
      <ReasonDialog
        caseId={caseId}
        status="monitoring"
        trigger="Reopen"
        title="Reopen this case?"
        description="The case goes back to Monitoring, the close date is cleared, and it returns to the open cases list."
        confirmLabel="Reopen case"
      />
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-foreground">Change case status</span>
      <ReasonDialog
        caseId={caseId}
        status="resolved"
        trigger={CLOSE_COPY.resolved.trigger}
        title={CLOSE_COPY.resolved.title}
        description={CLOSE_COPY.resolved.description}
        confirmLabel={CLOSE_COPY.resolved.confirm}
      />
      <ReasonDialog
        caseId={caseId}
        status="written_off"
        trigger={CLOSE_COPY.written_off.trigger}
        title={CLOSE_COPY.written_off.title}
        description={CLOSE_COPY.written_off.description}
        confirmLabel={CLOSE_COPY.written_off.confirm}
        destructive
      />
    </div>
  )
}
