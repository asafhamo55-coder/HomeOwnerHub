'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Check, EyeOff, MoreHorizontal, RefreshCw, Wallet } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Select,
  useToast,
} from '@homeowner-portal/ui'
import { categorizeAsExpense, confirmFuzzyMatch, ignoreTransaction, reRunBankMatch } from '@/lib/bank-rec'
import { usd } from '@/lib/money/format'

interface ExpenseOption {
  id: string
  label: string
}

/**
 * What a person can do with one unmatched bank transaction. The likely
 * action is a visible button (Confirm match for a deposit the agent
 * hinted at, Categorize for a withdrawal); the rest sit in the ⋯ menu.
 */
export function DispositionActions({
  bankTransactionId,
  hintedAssessmentId,
  expenseAccounts,
  isInbound,
  amount,
  description,
}: {
  bankTransactionId: string
  hintedAssessmentId: string | null
  expenseAccounts: ExpenseOption[]
  isInbound: boolean
  amount: number
  description: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [categorizing, setCategorizing] = useState(false)
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [memo, setMemo] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) {
        toast({ tone: 'error', message: r.error ?? 'That didn’t work. Try again.' })
        return
      }
      toast({ tone: 'success', message: success })
      router.refresh()
    })
  }

  function submitExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!expenseAccountId) {
      setErrors({ expenseAccountId: 'Pick the expense account this belongs to.' })
      return
    }
    startTransition(async () => {
      const r = await categorizeAsExpense({ bankTransactionId, expenseAccountId, memo: memo.trim() || undefined })
      if (!r.ok) {
        if (r.fieldErrors && (r.fieldErrors.expenseAccountId || r.fieldErrors.memo)) setErrors(r.fieldErrors)
        else toast({ tone: 'error', message: r.error })
        return
      }
      setCategorizing(false)
      toast({ tone: 'success', message: 'Expense posted and matched.' })
      router.refresh()
    })
  }

  const canConfirm = Boolean(hintedAssessmentId && isInbound)
  const canCategorize = !isInbound && expenseAccounts.length > 0

  return (
    <div className="flex items-center justify-end gap-2">
      {canConfirm ? (
        <Button
          size="sm"
          variant="secondary"
          icon={<Check aria-hidden />}
          loading={pending}
          onClick={() =>
            run(() => confirmFuzzyMatch({ bankTransactionId, assessmentId: hintedAssessmentId! }), 'Match confirmed and posted.')
          }
        >
          Confirm match
        </Button>
      ) : canCategorize ? (
        <Button size="sm" variant="secondary" icon={<Wallet aria-hidden />} onClick={() => setCategorizing(true)} disabled={pending}>
          Categorize
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          icon={<RefreshCw aria-hidden />}
          loading={pending}
          onClick={() => run(() => reRunBankMatch({ bankTransactionId }), 'Matcher re-run.')}
        >
          Re-match
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="More actions" disabled={pending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canConfirm || canCategorize ? (
            <DropdownMenuItem icon={<RefreshCw aria-hidden />} onSelect={() => run(() => reRunBankMatch({ bankTransactionId }), 'Matcher re-run.')}>
              Re-run matcher
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            icon={<EyeOff aria-hidden />}
            onSelect={() => run(() => ignoreTransaction({ bankTransactionId }), 'Marked reviewed — nothing posted.')}
          >
            Ignore (mark reviewed)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={categorizing} onOpenChange={(next) => !pending && setCategorizing(next)}>
        <DialogContent
          title="Categorize as an expense"
          description={`${usd(amount)} · ${description}. Posts the expense from cash and marks this transaction matched.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setCategorizing(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" form={`expense-${bankTransactionId}`} loading={pending}>
                Post expense
              </Button>
            </>
          }
        >
          <form id={`expense-${bankTransactionId}`} onSubmit={submitExpense} className="space-y-4">
            <Field label="Expense account" required error={errors.expenseAccountId}>
              <Select value={expenseAccountId || undefined} onValueChange={setExpenseAccountId} placeholder="Choose an account" disabled={pending}>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Memo" optional error={errors.memo}>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Short description" maxLength={500} disabled={pending} />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
