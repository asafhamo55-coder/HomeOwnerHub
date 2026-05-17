'use client'

import { useState, useTransition } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { Alert, Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { closePeriod } from '@/lib/periods'

export function ClosePeriodButton({ periodId }: { periodId: string }) {
  const confirm = useConfirm()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    setError(null)
    setOutcome(null)
    const ok = await confirm({
      title: 'Close this period?',
      description:
        "Locks this month's books — no more journal entries can be added. The closing entries (income / expense → equity) will be posted automatically.",
      confirmLabel: 'Close period',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await closePeriod({ periodId })
      if (!result.ok) {
        setError(result.error)
        toast({ tone: 'error', message: result.error })
      } else {
        const ni = result.netIncome.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        })
        setOutcome(
          `Closed. ${result.closingJeIds.length} closing JE(s) posted, net income ${ni}.`,
        )
        toast({ tone: 'success', message: `Period closed. Net income ${ni}.` })
        // Refresh after a beat so the user sees the outcome.
        setTimeout(() => window.location.reload(), 1200)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} variant="outline" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
        Close period
      </Button>
      {outcome ? (
        <span className="text-[11px] text-emerald-600">{outcome}</span>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
