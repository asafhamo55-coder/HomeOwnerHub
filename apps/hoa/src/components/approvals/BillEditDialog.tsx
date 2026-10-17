'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Dialog, DialogContent, Field, Fieldset, Input, Select, useToast } from '@homeowner-portal/ui'
import type { BillEditOptionLists } from '@/lib/approvals-inbox/model'
import type { BillProposalPayload } from '@/lib/bill-scan/proposal'
import { centsFromInput, centsToInput, editFormFrom, type BillEditFieldKey } from '@/lib/bill-scan/edit'
import { editBillProposal } from '@/lib/bill-scan/actions'

// BL-059: correct what the AI read before approving. The form starts from
// the proposal as it stands; Save re-validates everything on the server
// (lib/bill-scan/edit.ts) and records which fields a person changed.

type Errors = Partial<Record<BillEditFieldKey, string>>

interface LineRow {
  key: number
  description: string
  amount: string
}

export function BillEditDialog({
  approvalRequestId,
  payload,
  options,
}: {
  approvalRequestId: string
  payload: BillProposalPayload
  options: BillEditOptionLists
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const start = editFormFrom(payload)
  const [vendorId, setVendorId] = useState(start.vendorId ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(start.invoiceNumber)
  const [invoiceDate, setInvoiceDate] = useState(start.invoiceDate)
  const [dueDate, setDueDate] = useState(start.dueDate)
  const [total, setTotal] = useState(centsToInput(start.totalCents))
  const [accountId, setAccountId] = useState(start.expenseAccountId ?? '')
  const [lines, setLines] = useState<LineRow[]>(() =>
    start.lineItems.map((li, i) => ({ key: i, description: li.description, amount: centsToInput(li.amountCents) })),
  )
  const [nextKey, setNextKey] = useState(start.lineItems.length)
  const [errors, setErrors] = useState<Errors>({})

  function reset() {
    setVendorId(start.vendorId ?? '')
    setInvoiceNumber(start.invoiceNumber)
    setInvoiceDate(start.invoiceDate)
    setDueDate(start.dueDate)
    setTotal(centsToInput(start.totalCents))
    setAccountId(start.expenseAccountId ?? '')
    setLines(start.lineItems.map((li, i) => ({ key: i, description: li.description, amount: centsToInput(li.amountCents) })))
    setNextKey(start.lineItems.length)
    setErrors({})
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next: Errors = {}
    const totalCents = centsFromInput(total)
    if (totalCents === 'invalid') next.totalCents = 'Enter the total in dollars and cents, like 1,250.00.'
    const lineItems = lines.map((l) => ({ description: l.description, amountCents: centsFromInput(l.amount) }))
    if (lineItems.some((l) => l.amountCents === 'invalid')) next.lineItems = 'Enter each line amount in dollars and cents.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    startTransition(async () => {
      const r = await editBillProposal({
        approvalRequestId,
        vendorId: vendorId || null,
        invoiceNumber,
        invoiceDate,
        dueDate,
        totalCents: totalCents as number | null,
        expenseAccountId: accountId || null,
        lineItems: lineItems as Array<{ description: string; amountCents: number | null }>,
      })
      if (!r.ok) {
        if (r.fieldErrors && Object.keys(r.fieldErrors).length > 0) setErrors(r.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t save the changes', message: r.error })
        return
      }
      setOpen(false)
      toast({
        tone: 'success',
        message:
          r.editedFields.length === 0
            ? 'Nothing changed.'
            : r.canApprove
              ? 'Saved. Check the bill once more, then approve it.'
              : 'Saved. Some required details are still missing.',
      })
      router.refresh()
    })
  }

  const formId = `bill-edit-${approvalRequestId}`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        if (next) reset()
        setOpen(next)
      }}
    >
      <Button type="button" size="sm" variant="secondary" icon={<Pencil aria-hidden />} onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <DialogContent
        size="lg"
        title="Edit bill details"
        description="Correct anything the AI read wrong. Compare against the bill itself; changes are recorded as yours."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Save changes
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate className="space-y-5">
          <Field
            label="Vendor"
            hint={
              payload.vendor.extractedName && payload.vendor.match !== 'exact'
                ? `The bill says “${payload.vendor.extractedName}”.`
                : undefined
            }
            error={errors.vendorId}
          >
            <Select value={vendorId || undefined} onValueChange={setVendorId} disabled={pending} placeholder="Choose a vendor on file">
              {options.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Invoice number" error={errors.invoiceNumber}>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="As printed on the bill"
                maxLength={120}
                disabled={pending}
              />
            </Field>
            <Field label="Total" error={errors.totalCents}>
              <Input
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                prefix="$"
                placeholder="0.00"
                disabled={pending}
              />
            </Field>
            <Field label="Invoice date" error={errors.invoiceDate}>
              <Input
                type="date"
                value={invoiceDate}
                max={options.today}
                onChange={(e) => setInvoiceDate(e.target.value)}
                disabled={pending}
              />
            </Field>
            <Field label="Due date" optional error={errors.dueDate}>
              <Input
                type="date"
                value={dueDate}
                min={invoiceDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={pending}
              />
            </Field>
          </div>

          <Field label="Expense account" hint="Where this cost lands on the income statement." error={errors.expenseAccountId}>
            <Select value={accountId || undefined} onValueChange={setAccountId} disabled={pending} placeholder="Choose an account">
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>

          <Fieldset legend="Line items" hint="When every line has an amount, they must add up to the total." error={errors.lineItems}>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={l.key} className="flex min-w-0 items-start gap-2">
                  <Input
                    aria-label={`Line ${i + 1} description`}
                    value={l.description}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))}
                    maxLength={300}
                    placeholder="Description"
                    disabled={pending}
                    className="min-w-0 flex-1"
                  />
                  <Input
                    aria-label={`Line ${i + 1} amount`}
                    inputMode="decimal"
                    value={l.amount}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))}
                    prefix="$"
                    placeholder="0.00"
                    disabled={pending}
                    className="w-28 shrink-0 sm:w-32"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 aria-hidden />}
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    disabled={pending}
                  />
                </div>
              ))}
              {lines.length < 50 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<Plus aria-hidden />}
                  onClick={() => {
                    setLines((ls) => [...ls, { key: nextKey, description: '', amount: '' }])
                    setNextKey((k) => k + 1)
                  }}
                  disabled={pending}
                >
                  Add a line
                </Button>
              ) : null}
            </div>
          </Fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}
