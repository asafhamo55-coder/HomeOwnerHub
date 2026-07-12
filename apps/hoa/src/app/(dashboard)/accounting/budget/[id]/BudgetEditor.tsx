'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Alert, Button, Input, Select } from '@homeowner-portal/ui'
import { approveBudget, saveBudgetLineItems } from '@/lib/budgets'

interface LineItem {
  id?: string
  accountId: string
  amount: number
  notes: string
  accountLabel: string
  accountType: 'income' | 'expense'
}

interface AccountOption {
  id: string
  label: string
  type: 'income' | 'expense'
}

export function BudgetEditor({
  budgetId,
  editable,
  initial,
  accounts,
}: {
  budgetId: string
  editable: boolean
  initial: LineItem[]
  accounts: AccountOption[]
}) {
  const [lines, setLines] = useState<LineItem[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const [approving, startApprove] = useTransition()

  function addLine() {
    if (accounts.length === 0) return
    const a = accounts[0]
    setLines((prev) => [
      ...prev,
      {
        accountId: a.id,
        amount: 0,
        notes: '',
        accountLabel: a.label,
        accountType: a.type,
      },
    ])
    setSaved(false)
  }

  function updateLine(idx: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
    setSaved(false)
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveBudgetLineItems({
        budgetId,
        lineItems: lines.map((l) => ({
          accountId: l.accountId,
          amount: Number(l.amount) || 0,
          notes: l.notes || undefined,
        })),
      })
      if (!result.ok) setError(result.error)
      else setSaved(true)
    })
  }

  function handleApprove() {
    setError(null)
    if (!confirm('Approve this budget? Approved budgets are locked.')) return
    startApprove(async () => {
      const result = await approveBudget({ budgetId })
      if (!result.ok) setError(result.error)
      else window.location.reload()
    })
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs italic text-muted">
                  No line items yet. Add one to budget for a specific account.
                </td>
              </tr>
            ) : (
              lines.map((l, idx) => (
                <tr key={l.id ?? `new-${idx}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {editable ? (
                      <Select
                        value={l.accountId}
                        onValueChange={(v) => {
                          const acct = accounts.find((a) => a.id === v)
                          if (!acct) return
                          updateLine(idx, {
                            accountId: acct.id,
                            accountLabel: acct.label,
                            accountType: acct.type,
                          })
                        }}
                        className="w-full sm:w-56"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.label}</option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-foreground">{l.accountLabel}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={l.amount}
                        onChange={(e) => updateLine(idx, { amount: Number(e.target.value) || 0 })}
                        prefix={<span className="text-xs">$</span>}
                        className="w-32 text-right"
                      />
                    ) : (
                      <span className="font-mono text-foreground">
                        {l.amount.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <Input
                        type="text"
                        value={l.notes}
                        onChange={(e) => updateLine(idx, { notes: e.target.value })}
                        placeholder="optional"
                        className="w-full"
                      />
                    ) : (
                      <span className="text-xs text-muted">{l.notes || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-muted hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {saved ? <Alert variant="success">Line items saved.</Alert> : null}

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button onClick={addLine} variant="outline" size="sm" disabled={pending}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
            <Button onClick={handleApprove} variant="outline" disabled={approving || lines.length === 0}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Approve
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
