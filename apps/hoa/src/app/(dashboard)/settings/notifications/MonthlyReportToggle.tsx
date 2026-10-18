'use client'

import { useState, useTransition } from 'react'
import { Switch, useToast } from '@homeowner-portal/ui'
import { setMonthlyReportPreference } from '@/lib/monthly-report/actions'

/** The signed-in member's own "Monthly board report" email switch (BL-073). Saves on change. */
export function MonthlyReportToggle({ initial }: { initial: boolean }) {
  const toast = useToast()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await setMonthlyReportPreference({ on: next })
      if (!res.ok) {
        setOn(!next)
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({ tone: 'success', message: next ? 'You’ll get the monthly board report.' : 'Monthly board report turned off.' })
    })
  }

  return (
    <Switch
      label="Monthly board report"
      description="On the 1st of each month: last month’s cash, collections, overdue dues, budget, violations and what’s waiting on the board."
      checked={on}
      disabled={pending}
      onChange={(e) => change(e.currentTarget.checked)}
    />
  )
}
