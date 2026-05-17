'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { enterBill } from '@/lib/invoices'

interface Option {
  id: string
  label: string
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EnterBillForm({
  vendors,
  expenseAccounts,
}: {
  vendors: Option[]
  expenseAccounts: Option[]
}) {
  const router = useRouter()
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? '')
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayIso())
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!amount || amount <= 0) {
      setError('amount must be greater than 0')
      return
    }

    startTransition(async () => {
      const result = await enterBill({
        vendorId,
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        dueDate: dueDate || undefined,
        amount: Number(amount),
        expenseAccountId,
        memo: memo.trim() || undefined,
      })
      if (!result.ok) {
        setError(result.error)
      } else {
        router.push(`/accounting/invoices/${result.invoiceId}`)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-foreground">Vendor</span>
        <Select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          required
          disabled={pending}
          className="mt-1"
        >
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </Select>
      </label>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Expense account</span>
        <Select
          value={expenseAccountId}
          onChange={(e) => setExpenseAccountId(e.target.value)}
          required
          disabled={pending}
          className="mt-1"
        >
          {expenseAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </Select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Invoice number</span>
          <Input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="VEN-2026-0042"
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Amount</span>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            prefix={<span className="text-xs">$</span>}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Invoice date</span>
          <Input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Due date <span className="text-muted">(optional)</span></span>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={pending}
            className="mt-1"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-foreground">Memo <span className="text-muted">(optional)</span></span>
        <Input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Short description"
          disabled={pending}
          className="mt-1"
        />
      </label>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Enter bill
        </Button>
      </div>
    </form>
  )
}
