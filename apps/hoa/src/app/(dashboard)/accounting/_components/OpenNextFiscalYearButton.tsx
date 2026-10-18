'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, useConfirm, useToast } from '@homeowner-portal/ui'
import { openNextFiscalYear } from '@/lib/accounting/fiscal-year-actions'

/**
 * BL-076 "Open next fiscal year" — on Fiscal periods and in the budget
 * draft's "isn't open in the books yet" state. Admins only (the server
 * action refuses anyone else; pages render it only for admins). The labels
 * come from the server's plan; the action re-plans, so a stale page can't
 * open the wrong year, and a second click just says it is already open.
 */
export function OpenNextFiscalYearButton({
  label,
  range,
  currentLabel,
  variant = 'secondary',
}: {
  /** "FY 2027" */
  label: string
  /** "Jan 1 – Dec 31, 2027" */
  range: string
  /** The year that stays current until then, e.g. "FY 2026"; null when there's none. */
  currentLabel: string | null
  variant?: 'default' | 'secondary'
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  async function handleClick() {
    const ok = await confirm({
      title: `Open ${label}?`,
      description: `Adds ${label} (${range}) to the books so you can budget for it. ${
        currentLabel ? `${currentLabel} stays the current year` : 'Nothing posts to it'
      } until ${label} starts — dues, bills and recurring entries keep posting where they do today.`,
      confirmLabel: `Open ${label}`,
    })
    if (!ok) return
    startTransition(async () => {
      const result = await openNextFiscalYear()
      if (!result.ok) {
        toast({ tone: 'error', title: `Couldn’t open ${label}`, message: result.error })
        return
      }
      toast({ tone: 'success', title: result.created > 0 ? `${result.label} is open` : `${result.label} was already open`, message: result.message })
      router.refresh()
    })
  }

  return (
    <Button onClick={handleClick} variant={variant} loading={pending} icon={<CalendarPlus aria-hidden />}>
      Open next fiscal year
    </Button>
  )
}
