'use client'

import { useState, useTransition } from 'react'
import { Switch, useToast } from '@homeowner-portal/ui'
import { savePaymentReceiptSettings } from '@/lib/resident-notify/receipt-actions'

/**
 * The association-wide "Email owners a receipt when we record their
 * payment" switch (BL-114). Off until a board turns it on. Saves on change.
 */
export function PaymentReceiptToggle({ initial }: { initial: boolean }) {
  const toast = useToast()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const res = await savePaymentReceiptSettings({ on: next })
      if (!res.ok) {
        setOn(!next)
        toast({ tone: 'error', title: 'Not saved', message: res.error })
        return
      }
      toast({
        tone: 'success',
        message: next
          ? 'Owners will get an email receipt when you record their payment.'
          : 'Automatic payment receipts turned off.',
      })
    })
  }

  return (
    <Switch
      label="Email owners a receipt when we record their payment"
      description="When a board member records a payment on Dues (Mark paid) or confirms a bank deposit against a charge, the property’s owners get one email with the amount, date, how it was paid, the balance left and a link to their ledger. Owners who turned off emails aren’t sent one."
      checked={on}
      disabled={pending}
      onChange={(e) => change(e.currentTarget.checked)}
    />
  )
}
