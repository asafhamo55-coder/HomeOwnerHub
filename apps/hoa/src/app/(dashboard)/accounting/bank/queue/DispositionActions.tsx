'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, EyeOff, Loader2, RefreshCw, Wallet } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import {
  categorizeAsExpense,
  confirmFuzzyMatch,
  ignoreTransaction,
  reRunBankMatch,
} from '@/lib/bank-rec'

interface ExpenseOption {
  id: string
  label: string
}

export function DispositionActions({
  bankTransactionId,
  hintedAssessmentId,
  expenseAccounts,
  isInbound,
}: {
  bankTransactionId: string
  hintedAssessmentId: string | null
  expenseAccounts: ExpenseOption[]
  isInbound: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'expense'>('idle')
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? '')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'failed')
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {mode === 'idle' ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => run(() => reRunBankMatch({ bankTransactionId }))}
            variant="outline"
            size="sm"
            disabled={pending}
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-match
          </Button>
          {hintedAssessmentId && isInbound ? (
            <Button
              onClick={() =>
                run(() =>
                  confirmFuzzyMatch({ bankTransactionId, assessmentId: hintedAssessmentId }),
                )
              }
              size="sm"
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Confirm match
            </Button>
          ) : null}
          {!isInbound && expenseAccounts.length > 0 ? (
            <Button onClick={() => setMode('expense')} variant="outline" size="sm" disabled={pending}>
              <Wallet className="h-3 w-3" />
              Categorize expense
            </Button>
          ) : null}
          <Button
            onClick={() => run(() => ignoreTransaction({ bankTransactionId }))}
            variant="ghost"
            size="sm"
            disabled={pending}
            title="Mark reviewed without posting"
          >
            <EyeOff className="h-3 w-3" />
            Ignore
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-surface p-2">
          <label className="block text-xs">
            <span className="text-muted">Expense account</span>
            <Select
              value={expenseAccountId}
              onValueChange={setExpenseAccountId}
              className="mt-1"
              placeholder="Choose account"
            >
              {expenseAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs">
            <span className="text-muted">Memo (optional)</span>
            <Input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1"
              placeholder="Short description"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setMode('idle')
                setError(null)
              }}
              variant="ghost"
              size="sm"
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                run(() =>
                  categorizeAsExpense({
                    bankTransactionId,
                    expenseAccountId,
                    memo: memo.trim() || undefined,
                  }),
                )
              }
              size="sm"
              disabled={pending}
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Post expense
            </Button>
          </div>
        </div>
      )}
      {error ? <Alert variant="error" className="text-xs">{error}</Alert> : null}
    </div>
  )
}
