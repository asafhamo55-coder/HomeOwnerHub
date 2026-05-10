'use client'

import { useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { markDuesPaid } from '@/lib/dues'

export function MarkPaidButton({
  duesId,
  totalDue,
}: {
  duesId: string
  totalDue: number
}) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await markDuesPaid({ duesId, amountPaid: totalDue })
    })
  }

  return (
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
  )
}
