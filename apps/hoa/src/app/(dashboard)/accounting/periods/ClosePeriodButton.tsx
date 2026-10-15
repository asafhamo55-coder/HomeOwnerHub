'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Lock } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { closePeriod } from '@/lib/periods'
import { usd } from '@/lib/money/format'

export function ClosePeriodButton({ periodId, label }: { periodId: string; label: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: `Close ${label}?`,
      description:
        'Locks these books — no more journal entries can be added to the period. Closing entries (income and expenses into fund balance) post automatically for each fund.',
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
