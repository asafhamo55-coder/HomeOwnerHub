'use client'

import { Mail } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { sendPaymentReceipt } from '@/lib/resident-notify/receipt-actions'
import { formatDay, usd } from '@/lib/money/format'

/**
 * Email the owners a receipt for one recorded payment (BL-114). An explicit
 * board click, so it works whether or not automatic receipts are on. Asks
 * first: it emails a resident.
 */
export function SendReceiptButton({
  paymentId,
  amount,
  paidDay,
  unitLabel,
}: {
  paymentId: string
  amount: number
  /** yyyy-mm-dd */
  paidDay: string
  unitLabel: string
}) {
  const toast = useToast()
  return (
    <ConfirmDialog
      title={`Email a receipt for ${usd(amount)}?`}
      description={`Emails the owners of ${unitLabel} a receipt for the ${usd(amount)} payment dated ${formatDay(paidDay)}: the amount, date, how it was paid, the balance left and a link to their ledger. Owners who turned off emails aren’t sent one.`}
      confirmLabel="Send receipt"
      trigger={
        <Button size="xs" variant="ghost" icon={<Mail aria-hidden />}>
          Send receipt
        </Button>
      }
      onConfirm={async () => {
        const r = await sendPaymentReceipt({ paymentId })
        if (!r.ok) {
          toast({ tone: 'error', title: 'No receipt sent', message: r.error })
          return
        }
        if (r.status === 'held') {
          toast({ tone: 'warning', title: 'Receipt held', message: 'The safety guard held the email back. Nothing was sent.' })
          return
        }
        toast({ tone: 'success', message: `Receipt emailed to ${r.sent === 1 ? 'the owner' : `${r.sent} owners`}.` })
      }}
    />
  )
}
