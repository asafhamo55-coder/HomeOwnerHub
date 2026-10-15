'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Scale } from 'lucide-react'
import { Alert, Button, Field, Input, useToast } from '@homeowner-portal/ui'
import { reconcileBankAccount } from '@/lib/bank-reconciliation'
import { todayIso, usd } from '@/lib/money/format'

export function ReconcileForm({ bankAccountId }: { bankAccountId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [statementDate, setStatementDate] = useState(todayIso())
  const [statementBalance, setStatementBalance] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [difference, setDifference] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setDifference(null)
    const raw = statementBalance.replace(/[$,\s]/g, '')
    const balance = Number(raw)
    const next: Record<string, string> = {}
    if (!statementDate) next.statementDate = 'Enter the statement’s closing date.'
    if (raw === '' || !Number.isFinite(balance)) next.statementBalance = 'Enter the ending balance printed on the statement.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    startTransition(async () => {
      const r = await reconcileBankAccount({ bankAccountId, statementDate, statementBalance: balance })
      if (!r.ok) {
        if (r.fieldErrors && (r.fieldErrors.statementDate || r.fieldErrors.statementBalance)) setErrors(r.fieldErrors)
        else toast({ tone: 'error', title: 'Couldn’t reconcile', message: r.error })
        return
      }
      setDifference(r.difference)
      router.refresh()
    })
  }

  const balanced = difference !== null && Math.abs(difference) < 0.01

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Statement date" required hint="The closing date on the bank statement." error={errors.statementDate}>
          <Input type="date" value={statementDate} max={todayIso()} onChange={(e) => setStatementDate(e.target.value)} disabled={pending} />
        </Field>
        <Field label="Ending balance" required hint="As printed on the statement." error={errors.statementBalance}>
          <Input inputMode="decimal" prefix="$" placeholder="0.00" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} disabled={pending} />
        </Field>
      </div>

      {difference !== null ? (
        balanced ? (
          <Alert variant="success" title="Balanced">
            The statement matches the ledger through that date. Approve it below to lock it in.
          </Alert>
        ) : (
          <Alert variant="warning" title={`Off by ${usd(difference)}`}>
            Usually deposits or cleared checks the ledger doesn’t have yet. Match them in the queue, then reconcile again — or approve
            below with the difference on record.
          </Alert>
        )
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" loading={pending} icon={<Scale aria-hidden />}>
          Reconcile
        </Button>
      </div>
    </form>
  )
}
