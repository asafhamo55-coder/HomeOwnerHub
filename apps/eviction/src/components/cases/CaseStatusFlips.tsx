'use client'

import { useState, useTransition } from 'react'
import { Loader2, Check, ChevronRight } from 'lucide-react'
import { Alert, Button, cn } from '@homeowner-portal/ui'
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
      <ol className="flex items-center gap-1 text-sm">
        {PIPELINE.map((stage, i) => {
          const isPast = i < currentIndex
          const isCurrent = i === currentIndex
          return (
            <li key={stage.id} className="flex items-center gap-1">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                  isPast
                    ? 'bg-emerald-100 text-emerald-700'
                    : isCurrent
                      ? 'bg-primary text-primary-fg'
                      : 'bg-muted-fg/10 text-muted-fg',
                )}
              >
                {isPast ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  isPast || isCurrent ? 'text-muted' : 'text-muted-fg',
                )}
              >
                {stage.label}
              </span>
              {i < PIPELINE.length - 1 ? (
                <ChevronRight className="mx-0.5 h-3 w-3 text-muted-fg" aria-hidden />
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
            <input
              type="text"
              value={outcomeText}
              onChange={(e) => setOutcomeText(e.target.value)}
              placeholder="Outcome (e.g. judgment for landlord, settled, dismissed)"
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={pending}
            />
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
