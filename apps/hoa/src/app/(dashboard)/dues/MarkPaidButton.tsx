'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { markAssessmentPaid } from '@/lib/assessments'
import { usd } from '@/lib/money/format'

/**
 * Record the remaining balance as paid. It posts a payment journal entry,
 * so it asks first — one stray tap used to record money nobody received.
 */
export function MarkPaidButton({ assessmentId, balance, unitLabel }: { assessmentId: string; balance: number; unitLabel: string }) {
  const router = useRouter()
  const toast = useToast()
  return (
    <ConfirmDialog
      title={`Record ${usd(balance)} paid?`}
      description={`Marks this charge for ${unitLabel} paid in full and posts the payment to the ledger. Use it when money arrived outside the portal (check, cash).`}
      confirmLabel="Record payment"
      trigger={
        <Button size="xs" variant="secondary" icon={<Check aria-hidden />}>
          Mark paid
        </Button>
      }
      onConfirm={async () => {
        const result = await markAssessmentPaid({ assessmentId, amountPaid: balance, paymentMethod: 'other' })
        if (!result.ok) {
          toast({ tone: 'error', title: 'Couldn’t record the payment', message: result.error })
          throw new Error(result.error)
        }
        toast({ tone: 'success', message: `${usd(balance)} recorded for ${unitLabel}.` })
        router.refresh()
      }}
    />
  )
}
