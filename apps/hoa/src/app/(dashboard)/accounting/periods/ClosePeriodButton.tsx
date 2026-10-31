'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Lock } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { closePeriod } from '@/lib/periods'
import { usd } from '@/lib/money/format'
import { closeWarnings, type CloseChecks } from './close-checks-shared'

/** The confirm dialog body: what closing does, then any checks worth a look. */
export function ClosePeriodDescription({ checks, endDate }: { checks: CloseChecks; endDate: string }) {
  const warnings = closeWarnings(checks, endDate)
  return (
    <span className="block space-y-2">
      <span className="block">
        Locks these books, so no more journal entries can be added to the period. Closing entries (income and expenses into fund balance) post automatically for each fund.
      </span>
      {warnings.length > 0 ? (
        <span className="block">
          <span className="block font-medium text-foreground">Before you close</span>
          <ul className="list-disc pl-5" data-testid="close-warnings">
            {warnings.map((w) => (
              <li key={w.text}>{w.text}</li>
            ))}
          </ul>
        </span>
      ) : null}
    </span>
  )
}

export function ClosePeriodButton({
  periodId,
  label,
  endDate,
  checks,
}: {
  periodId: string
  label: string
  endDate: string
  checks: CloseChecks
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: `Close ${label}?`,
      description: <ClosePeriodDescription checks={checks} endDate={endDate} />,
      confirmLabel: 'Close period',
      destructive: true,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await closePeriod({ periodId })
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t close the period', message: result.error })
        return
      }
      toast({
        tone: 'success',
        title: `${label} closed`,
        message: `${result.closingJeIds.length} closing ${result.closingJeIds.length === 1 ? 'entry' : 'entries'} posted · net income ${usd(result.netIncome)}.`,
      })
      router.refresh()
    })
  }

  return (
    <Button onClick={handleClick} variant="secondary" size="sm" loading={pending} icon={<Lock aria-hidden />}>
      Close period
    </Button>
  )
}
