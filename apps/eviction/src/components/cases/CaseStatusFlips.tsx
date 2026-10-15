'use client'

import { useState, useTransition } from 'react'
import { Loader2, Check, ChevronRight } from 'lucide-react'
import { Alert, Button, cn, Field, Input } from '@homeowner-portal/ui'
import { updateCaseStatus } from '@/lib/case-actions'

interface CaseStatusFlipsProps {
  caseId: string
  currentStatus: 'intake' | 'notice_sent' | 'filed' | 'resolved' | string
  filingReady: boolean
}

/**
 * The four canonical statuses. We don't expose 'filing_ready' because that
 * one is derived from notice_sent + cure date elapsing — the wizard sets
 * notice_sent when the notice is approved, and the dashboard surfaces
 * filing_ready dynamically. Persisting 'filed' is the user's
 * acknowledgement that they actually went to JP court.
 */
const PIPELINE = [
  { id: 'intake', label: 'Intake', help: 'Drafted, not yet served' },
  { id: 'notice_sent', label: 'Notice sent', help: 'Cure clock running' },
  { id: 'filed', label: 'Filed', help: 'Filed in JP court' },
  { id: 'resolved', label: 'Resolved', help: 'Closed' },
] as const

export function CaseStatusFlips({
  caseId,
  currentStatus,
  filingReady,
}: CaseStatusFlipsProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [outcomeText, setOutcomeText] = useState('')

  const currentIndex = PIPELINE.findIndex((s) => s.id === currentStatus)

  function flipTo(status: 'intake' | 'notice_sent' | 'filed' | 'resolved') {
    setError(null)
    startTransition(async () => {
      const result = await updateCaseStatus({
        caseId,
        status,
        outcome: status === 'resolved' ? outcomeText.trim() || undefined : undefined,
      })
      if (!result.ok) setError(result.error ?? 'Could not update status.')
    })
  }

  return (
    <div className="space-y-3">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {PIPELINE.map((stage, i) => {
          const isPast = i < currentIndex
          const isCurrent = i === currentIndex
          return (
            <li key={stage.id} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  isPast
                    ? 'bg-success-subtle text-success'
                    : isCurrent
                      ? 'bg-primary text-primary-fg'
                      : 'bg-muted/10 text-muted',
                )}
              >
                {isPast ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  isPast || isCurrent ? 'text-foreground' : 'text-muted',
                )}
              >
                {stage.label}
              </span>
              {i < PIPELINE.length - 1 ? (
                <ChevronRight className="mx-0.5 h-3 w-3 text-muted" aria-hidden />
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {currentStatus === 'notice_sent' && filingReady ? (
          <Button onClick={() => flipTo('filed')} loading={pending}>
            Mark as filed
          </Button>
        ) : null}
        {currentStatus === 'filed' ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Field label="Outcome" hideLabel className="flex-1">
              <Input
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="Outcome, e.g. judgment for landlord, settled, dismissed"
                disabled={pending}
              />
            </Field>
            <Button
              onClick={() => flipTo('resolved')}
              loading={pending}
              disabled={!outcomeText.trim()}
            >
              Mark as resolved
            </Button>
          </div>
        ) : null}
        {currentStatus !== 'intake' && currentStatus !== 'resolved' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => flipTo('intake')}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Move back to intake
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="error" title="Couldn't update status">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
