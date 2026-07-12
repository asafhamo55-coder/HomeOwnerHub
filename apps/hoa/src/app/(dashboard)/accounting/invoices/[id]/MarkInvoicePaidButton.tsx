'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Alert, Button, Select } from '@homeowner-portal/ui'
import { markInvoicePaid } from '@/lib/invoices'

const METHODS = ['check', 'ach', 'card', 'cash', 'other'] as const

export function MarkInvoicePaidButton({
  invoiceId,
  amount,
}: {
  invoiceId: string
  amount: number
}) {
  const [method, setMethod] = useState<(typeof METHODS)[number]>('check')
  const [externalRef, setExternalRef] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function currency(n: number): string {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await markInvoicePaid({
        invoiceId,
        paymentMethod: method,
        externalRef: externalRef || undefined,
      })
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Payment method
          <Select
            value={method}
            onValueChange={(v) => setMethod(v as (typeof METHODS)[number])}
            className="w-full sm:w-56"
            disabled={pending}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
          Reference (check #, etc.)
          <input
            type="text"
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            placeholder="optional"
            disabled={pending}
          />
        </label>
        <Button onClick={handleClick} disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Mark paid · {currency(amount)}
        </Button>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
