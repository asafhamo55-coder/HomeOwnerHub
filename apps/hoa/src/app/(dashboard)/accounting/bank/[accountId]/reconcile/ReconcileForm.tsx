'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Alert, Button, Input } from '@homeowner-portal/ui'
import { reconcileBankAccount } from '@/lib/bank-reconciliation'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ReconcileForm({ bankAccountId }: { bankAccountId: string }) {
  const router = useRouter()
  const [statementDate, setStatementDate] = useState(todayIso())
  const [statementBalance, setStatementBalance] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    difference: number
    ledger?: number
  } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (typeof statementBalance !== 'number') {
      setError('statement balance required')
      return
    }
    startTransition(async () => {
      const r = await reconcileBankAccount({
        bankAccountId,
        statementDate,
        statementBalance,
      })
      if (!r.ok) setError(r.error)
      else {
        setResult({ difference: r.difference })
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Statement date</span>
          <Input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Statement balance</span>
          <Input
            type="number"
            step={0.01}
            value={statementBalance}
            onChange={(e) =>
              setStatementBalance(e.target.value === '' ? '' : Number(e.target.value))
            }
            prefix={<span className="text-xs">$</span>}
            required
            disabled={pending}
            className="mt-1"
          />
        </label>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {result ? (
        <Alert variant={Math.abs(result.difference) < 0.01 ? 'success' : 'warning'}>
          {Math.abs(result.difference) < 0.01
            ? 'Reconciliation matches: statement balance equals ledger balance.'
            : `Difference: ${result.difference.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}. ` +
              `Outstanding deposits or cleared checks not yet posted.`}
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Reconcile
        </Button>
      </div>
    </form>
  )
}
