'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Eye, X } from 'lucide-react'
import { Alert, Button, Field, Textarea, useToast } from '@homeowner-portal/ui'
import { respondToViolationReport, type ViolationReportStatus } from '@/lib/board-review'
import { AiRewriteButton } from '@/components/ai/AiRewriteButton'

type ReportDecision = 'under_review' | 'opened_as_violation' | 'closed_no_action' | 'dismissed'

const DECISION_DONE: Record<ReportDecision, string> = {
  under_review: 'Marked under review.',
  opened_as_violation: 'Opened as a formal violation.',
  closed_no_action: 'Closed — no action taken.',
  dismissed: 'Report dismissed.',
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
  const toast = useToast()
  const [isPending, startTransition] = useTransition()
  const [pendingDecision, setPendingDecision] = useState<ReportDecision | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(currentNote ?? '')

  function submit(decision: ReportDecision) {
    setError(null)
    setPendingDecision(decision)
    startTransition(async () => {
      const result = await respondToViolationReport({
        reportId,
        decision,
        boardNote: note.trim() || null,
      })
      setPendingDecision(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast({ tone: 'success', message: DECISION_DONE[decision] })
      router.refresh()
    })
  }

  const btn = (decision: ReportDecision) => ({
    onClick: () => submit(decision),
    loading: pendingDecision === decision,
    disabled: isPending,
  })

  return (
    <div className="space-y-4">
      <Field
        label="Internal note"
        hint="Optional. Board only — the reporter never sees this."
        labelAside={
          <AiRewriteButton
            value={note}
            onChange={setNote}
            context="Internal board note on a violation report — not visible to the reporter"
            disabled={isPending}
          />
        }
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} />
      </Field>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex flex-col gap-2">
        <Button {...btn('opened_as_violation')} icon={<AlertTriangle aria-hidden />}>
          {currentStatus === 'opened_as_violation' ? 'Save — opened as violation' : 'Open as formal violation'}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" {...btn('closed_no_action')}>
            Close, no action
          </Button>
          <Button variant="secondary" {...btn('dismissed')} icon={<X aria-hidden />}>
            Dismiss
          </Button>
        </div>
        <Button
          variant="ghost"
          {...btn('under_review')}
          disabled={isPending || currentStatus === 'under_review'}
          icon={<Eye aria-hidden />}
        >
          {currentStatus === 'under_review' ? 'Under review' : 'Mark under review'}
        </Button>
      </div>
    </div>
  )
}
