'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { approveReconciliation } from '@/lib/bank-reconciliation'

/**
 * Approve action lives on each non-approved reconciliation row. When
 * the diff is > 1¢ the server action refuses the first attempt; we
 * then confirm with the manager and re-submit with force=true.
 */
export function ApproveReconciliationButton({
  reconciliationId,
  difference,
}: {
  reconciliationId: string
  difference: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const hasDiff = Math.abs(difference) > 0.01

  function handleClick() {
    setError(null)
    if (
      hasDiff &&
      !confirm(
        `Difference is ${difference.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. ` +
          `Approve anyway? The variance will stay on the record.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const r = await approveReconciliation({
        reconciliationId,
        force: hasDiff,
      })
      if (!r.ok) {
        setError(r.error)
      } else {
        window.location.reload()
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Approve
      </Button>
      {error ? <Alert variant="error" className="text-xs">{error}</Alert> : null}
    </div>
  )
}
