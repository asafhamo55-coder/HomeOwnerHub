'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Alert, Button, Dialog, DialogContent, DialogTrigger, Field, Input, Select, useToast } from '@homeowner-portal/ui'
import { createManualBankAccount } from '@/lib/bank-import/actions'

interface FundOption {
  id: string
  label: string
}

/**
 * BL-144: a bank account that isn't linked through Plaid. Its
 * transactions come from statement files the board imports, then go
 * through the same matching queue.
 */
export function AddManualAccountButton({
  funds,
  variant = 'secondary',
}: {
  funds: FundOption[]
  variant?: 'default' | 'secondary' | 'ghost'
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [bankName, setBankName] = useState('')
  const [last4, setLast4] = useState('')
  const [fundId, setFundId] = useState(funds[0]?.id ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const next: Record<string, string> = {}
    if (!accountName.trim()) next.accountName = 'Give the account a name, like “Operating checking”.'
    if (last4.trim() && !/^\d{4}$/.test(last4.trim())) next.last4 = 'Enter exactly the last 4 digits, or leave it blank.'
    if (!fundId) next.fundId = 'Pick the fund this account belongs to.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    startTransition(async () => {
      const r = await createManualBankAccount({ accountName, bankName, last4, fundId })
      if (!r.ok) {
        if (r.fieldErrors) setErrors(r.fieldErrors)
        setError(r.error)
        return
      }
      setOpen(false)
      toast({ tone: 'success', message: 'Account added. Import a statement to bring in its transactions.' })
      router.push(`/accounting/bank/${r.id}/import`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant} icon={<FilePlus2 aria-hidden />}>
          Add manual account
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a manual bank account"
        description="For a bank or credit union you'd rather not link. You'll import its statements as CSV, OFX or QFX files instead."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="manual-bank-account" loading={pending} disabled={funds.length === 0}>
              Add account
            </Button>
          </>
        }
      >
        {funds.length === 0 ? (
          <Alert variant="warning" title="No funds yet">
            A bank account attaches to a fund, and this association has none. An admin opens the books first, from Link bank account.
          </Alert>
        ) : (
          <form id="manual-bank-account" onSubmit={submit} noValidate className="space-y-4">
            <Field label="Account name" required error={errors.accountName}>
              <Input value={accountName} maxLength={80} onChange={(e) => setAccountName(e.target.value)} disabled={pending} />
            </Field>
            <Field label="Bank name" error={errors.bankName}>
              <Input value={bankName} maxLength={80} onChange={(e) => setBankName(e.target.value)} disabled={pending} />
            </Field>
            <Field label="Last 4 digits" hint="Only the last four. Never the full account number." error={errors.last4}>
              <Input inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} disabled={pending} />
            </Field>
            <Field label="Fund" required hint="Operating for day-to-day checking; Reserve for savings set aside for repairs." error={errors.fundId}>
              <Select value={fundId} onValueChange={setFundId} disabled={pending}>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            {error && Object.keys(errors).length === 0 ? <Alert variant="error">{error}</Alert> : null}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
