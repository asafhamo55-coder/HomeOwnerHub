'use client'

import { useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { markPeriodPaid } from '@/lib/rent'

export function MarkPaidButton({
  ledgerId,
  amountDue,
}: {
  ledgerId: string
  amountDue: number
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      icon={<Check aria-hidden />}
      onClick={() =>
        startTransition(async () => {
          await markPeriodPaid({ ledgerId, amountPaid: amountDue })
        })
      }
    >
      Mark paid
    </Button>
  )
}
