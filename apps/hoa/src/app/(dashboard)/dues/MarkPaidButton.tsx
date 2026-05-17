'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Alert, cn } from '@homeowner-portal/ui'
import { markAssessmentPaid } from '@/lib/assessments'

export function MarkPaidButton({
  assessmentId,
  balance,
}: {
  assessmentId: string
  balance: number
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await markAssessmentPaid({
        assessmentId,
        amountPaid: balance,
        paymentMethod: 'other',
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          'inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50',
        )}
      >
        {pending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Check className="h-3 w-3" />
        )}
        Mark paid
      </button>
      {error ? (
        <Alert variant="error" className="text-xs">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
