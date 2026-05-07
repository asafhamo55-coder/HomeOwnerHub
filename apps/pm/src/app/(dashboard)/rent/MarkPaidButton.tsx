'use client'

import { useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@homeownerhub/ui'
import { markPeriodPaid } from '@/lib/rent'

export function MarkPaidButton({
  ledgerId,
  amountDue,
}: {
  ledgerId: string
  amountDue: number
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await markPeriodPaid({ ledgerId, amountPaid: amountDue })
    })
  }

  return (
    <button
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
  )
}
