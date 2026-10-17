'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { Button, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { enterBill } from '@/lib/invoices'
import { usd } from '@/lib/money/format'

interface Option {
  id: string
  label: string
}

type Errors = Partial<Record<'vendorId' | 'expenseAccountId' | 'invoiceNumber' | 'invoiceDate' | 'dueDate' | 'amount' | 'memo', string>>

export function EnterBillForm({
  vendors,
  expenseAccounts,
  today,
}: {
  vendors: Option[]
  expenseAccounts: Option[]
  /** The association's today, 'YYYY-MM-DD', from the server (BL-065). */
  today: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [vendorId, setVendorId] = useState(vendors.length === 1 ? vendors[0].id : '')
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amt = Number(amount.replace(/[$,\s]/g, ''))
    const next: Errors = {}
    if (!vendorId) next.vendorId = 'Pick a vendor.'
    if (!expenseAccountId) next.expenseAccountId = 'Pick an expense account.'
    if (!invoiceNumber.trim()) next.invoiceNumber = 'Enter the invoice number from the bill.'
    if (!Number.isFinite(amt) || amt <= 0) next.amount = 'Enter an amount greater than $0.'
    if (dueDate && dueDate < invoiceDate) next.dueDate = 'The due date can’t be before the invoice date.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    startTransition(async () => {
      const result = await enterBill({
        vendorId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: dueDate || undefined,
        amount: amt,
        expenseAccountId,
        memo: memo.trim() || undefined,
      })
      if (!result.ok) {
        if (result.fieldErrors && Object.keys(result.fieldErrors).some((k) => k !== '_')) setErrors(result.fieldErrors as Errors)
        else toast({ tone: 'error', title: 'Couldn’t enter the bill', message: result.error })
        return
      }
      toast({ tone: 'success', message: `Bill ${invoiceNumber.trim()} entered for ${usd(amt)}.` })
      router.push(`/accounting/invoices/${result.invoiceId}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field label="Vendor" required error={errors.vendorId}>
        <Select value={vendorId || undefined} onValueChange={setVendorId} disabled={pending} placeholder="Choose a vendor">
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Invoice number" required error={errors.invoiceNumber}>
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="As printed on the bill" maxLength={120} disabled={pending} />
        </Field>
        <Field label="Amount" required error={errors.amount}>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} prefix="$" placeholder="0.00" disabled={pending} />
        </Field>
        <Field label="Invoice date" required error={errors.invoiceDate}>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Due date" optional error={errors.dueDate}>
          <Input type="date" value={dueDate} min={invoiceDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
        </Field>
      </div>

      <Field label="Expense account" required hint="Where this cost lands on the income statement." error={errors.expenseAccountId}>
        <Select value={expenseAccountId || undefined} onValueChange={setExpenseAccountId} disabled={pending} placeholder="Choose an account">
          {expenseAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Memo" optional hint="Shows on the journal entry." error={errors.memo}>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} placeholder="October mowing and edging" disabled={pending} />
      </Field>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/accounting/invoices')} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={<Plus aria-hidden />}>
          Enter bill
        </Button>
      </div>
    </form>
  )
}
