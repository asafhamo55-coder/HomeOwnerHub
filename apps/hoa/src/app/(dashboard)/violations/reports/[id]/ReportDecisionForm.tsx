'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Eye, X } from 'lucide-react'
import { Badge, Button, Textarea } from '@homeowner-portal/ui'
import { respondToViolationReport, type ViolationReportStatus } from '@/lib/board-review'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'

type ReportDecision =
  | 'under_review'
  | 'opened_as_violation'
  | 'closed_no_action'
  | 'dismissed'

const DECISION_DONE: Record<ReportDecision, string> = {
  under_review: 'Marked under review.',
  opened_as_violation: 'Opened as a formal violation.',
  closed_no_action: 'Closed — no action taken.',
  dismissed: 'Report dismissed.',
}

const STATUS_LABEL: Record<ViolationReportStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  opened_as_violation: 'Opened as violation',
  closed_no_action: 'Closed — no action',
  dismissed: 'Dismissed',
}

const STATUS_VARIANT: Record<ViolationReportStatus, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  submitted: 'warning',
  under_review: 'default',
  opened_as_violation: 'destructive',
  closed_no_action: 'outline',
  dismissed: 'outline',
}

export function ReportDecisionForm({
  reportId,
  currentNote,
  currentStatus,
}: {
  reportId: string
  currentNote: string | null
  currentStatus: ViolationReportStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [note, setNote] = useState(currentNote ?? '')

  function submit(decision: ReportDecision) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await respondToViolationReport({
        reportId,
        decision,
        boardNote: note.trim() || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(DECISION_DONE[decision])
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">Current status</span>
        <Badge variant={STATUS_VARIANT[currentStatus]} size="sm">
          {STATUS_LABEL[currentStatus]}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Internal note (board only)</span>
          <AiRewriteButton
            value={note}
            onChange={setNote}
            context="Internal board note on a violation report — not visible to the reporter"
            disabled={isPending}
          />
        </div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Notes for other board members. Not visible to the reporter."
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {success}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={currentStatus === 'under_review' ? 'default' : 'outline'}
          size="sm"
          onClick={() => submit('under_review')}
          disabled={isPending}
        >
          <Eye className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Mark under review'}
        </Button>
        <Button
          variant={currentStatus === 'dismissed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => submit('dismissed')}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Dismiss'}
        </Button>
        <Button
          variant={currentStatus === 'closed_no_action' ? 'default' : 'outline'}
          size="sm"
          onClick={() => submit('closed_no_action')}
          disabled={isPending}
        >
          {isPending ? 'Saving…' : 'Close — no action'}
        </Button>
        <Button
          variant={currentStatus === 'opened_as_violation' ? 'default' : 'outline'}
          size="sm"
          onClick={() => submit('opened_as_violation')}
          disabled={isPending}
        >
          <AlertTriangle className="h-4 w-4" />
          {isPending ? 'Saving…' : 'Open as formal violation'}
        </Button>
      </div>
    </div>
  )
}
