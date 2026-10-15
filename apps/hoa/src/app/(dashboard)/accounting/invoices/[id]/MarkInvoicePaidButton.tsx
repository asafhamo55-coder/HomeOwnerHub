'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { markInvoicePaid } from '@/lib/invoices'
import { usd } from '@/lib/money/format'

const METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH / bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
] as const
type Method = (typeof METHODS)[number]['value']

/**
 * Records payment of the full invoice and posts Dr AP / Cr Cash. The
 * button names the amount so nobody pays a bill without seeing what it is.
 */
export function MarkInvoicePaidButton({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const router = useRouter()
  const toast = useToast()
  const [method, setMethod] = useState<Method>('check')
  const [externalRef, setExternalRef] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})
    startTransition(async () => {
      const result = await markInvoicePaid({
        invoiceId,
        paymentMethod: method,
        externalRef: externalRef.trim() || undefined,
      })
      if (!result.ok) {
        if (result.fieldErrors?.paymentMethod || result.fieldErrors?.externalRef) setErrors(result.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t record the payment', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Payment of ${usd(amount)} recorded.` })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <Field label="Paid by" error={errors.paymentMethod} className="sm:w-56">
        <Select value={method} onValueChange={(v) => setMethod(v as Method)} disabled={pending}>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Reference" optional hint="Check number or confirmation code." error={errors.externalRef} className="sm:flex-1">
        <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} maxLength={120} disabled={pending} />
      </Field>
      <Button type="submit" loading={pending} icon={<Check aria-hidden />} className="sm:mb-[1.375rem]">
        Mark paid · {usd(amount)}
      </Button>
    </form>
  )
}
