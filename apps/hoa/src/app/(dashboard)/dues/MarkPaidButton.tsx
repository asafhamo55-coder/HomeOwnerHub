'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogContent, useToast } from '@homeowner-portal/ui'
import { markAssessmentPaid } from '@/lib/assessments'
import { isBooksNotOpen } from '@/lib/accounting/books-not-open'
import { BooksNotOpenNotice } from '../_components/BooksNotOpenNotice'
import { usd } from '@/lib/money/format'

/**
 * Record the remaining balance as paid. It posts a payment journal entry,
 * so it asks first — one stray tap used to record money nobody received.
 * With no open books (BL-072) the confirm closes and a dialog offers to
 * open them instead of toasting the failure.
 */
export function MarkPaidButton({ assessmentId, balance, unitLabel }: { assessmentId: string; balance: number; unitLabel: string }) {
  const router = useRouter()
  const toast = useToast()
  const [booksGap, setBooksGap] = useState<{ canOpenBooks: boolean } | null>(null)
  return (
    <>
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
          if (isBooksNotOpen(result)) {
            setBooksGap({ canOpenBooks: result.canOpenBooks })
            return
          }
          if (!result.ok) {
            toast({ tone: 'error', title: 'Couldn’t record the payment', message: result.error })
            throw new Error(result.error)
          }
          toast({ tone: 'success', message: `${usd(balance)} recorded for ${unitLabel}.` })
          router.refresh()
        }}
      />
      <Dialog open={booksGap !== null} onOpenChange={(open) => !open && setBooksGap(null)}>
        <DialogContent title="Couldn’t record the payment">
          {booksGap ? <BooksNotOpenNotice canOpenBooks={booksGap.canOpenBooks} returnTo="/dues" /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
