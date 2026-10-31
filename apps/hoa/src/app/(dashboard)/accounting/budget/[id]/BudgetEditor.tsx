'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Kpi,
  Select,
  TableScroll,
  useConfirm,
  useToast,
} from '@homeowner-portal/ui'
import { approveBudget, saveBudgetLineItems } from '@/lib/budgets'
import { usd } from '@/lib/money/format'

interface LineItem {
  key: string
  accountId: string
  amount: string
  notes: string
  accountLabel: string
  accountType: 'income' | 'expense'
}

interface AccountOption {
  id: string
  label: string
  type: 'income' | 'expense'
}

/**
 * Budget totals and line items. The totals are computed from the lines on
 * screen, so they move as you type — the old page showed totals from the
 * last save above an editor holding different numbers. Approving is
 * blocked while there are unsaved edits (it would lock the saved version,
 * not the one on screen).
 */
export function BudgetEditor({
  budgetId,
  editable,
  initial,
  accounts,
}: {
  budgetId: string
  editable: boolean
  initial: { id: string; accountId: string; amount: number; notes: string; accountLabel: string; accountType: 'income' | 'expense' }[]
  accounts: AccountOption[]
}) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [lines, setLines] = useState<LineItem[]>(() =>
    initial.map((l) => ({ ...l, key: l.id, amount: String(l.amount) })),
  )
  const [dirty, setDirty] = useState(false)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [approving, startApprove] = useTransition()

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const l of lines) {
      const n = Number(l.amount) || 0
      if (l.accountType === 'income') income += n
      else expense += n
    }
    return { income, expense, net: income - expense }
  }, [lines])

  function update(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
    setDirty(true)
  }

  function addLine() {
    const used = new Set(lines.map((l) => l.accountId))
    const a = accounts.find((x) => !used.has(x.id)) ?? accounts[0]
    if (!a) return
    setLines((prev) => [
      ...prev,
      { key: `new-${Date.now()}`, accountId: a.id, amount: '', notes: '', accountLabel: a.label, accountType: a.type },
    ])
    setDirty(true)
  }

  function save() {
    const errs: Record<string, string> = {}
    for (const l of lines) {
      const n = Number(l.amount)
      if (l.amount.trim() !== '' && (!Number.isFinite(n) || n < 0)) errs[l.key] = 'Enter an amount of $0 or more.'
    }
    setRowErrors(errs)
    if (Object.keys(errs).length > 0) return
    startSave(async () => {
      const result = await saveBudgetLineItems({
        budgetId,
        lineItems: lines.map((l) => ({ accountId: l.accountId, amount: Number(l.amount) || 0, notes: l.notes || undefined })),
      })
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t save', message: result.error })
        return
      }
      setDirty(false)
      toast({ tone: 'success', message: 'Budget saved.' })
      router.refresh()
    })
  }

  async function approve() {
    const ok = await confirm({
      title: 'Approve this budget?',
      description: `Locks ${lines.length} line items totalling ${usd(totals.income, { whole: true })} income and ${usd(totals.expense, { whole: true })} expenses. Approved budgets can’t be edited.`,
      confirmLabel: 'Approve budget',
    })
    if (!ok) return
    startApprove(async () => {
      const result = await approveBudget({ budgetId })
      if (!result.ok) {
        toast({ tone: 'error', title: 'Couldn’t approve', message: result.error })
        return
      }
      toast({ tone: 'success', message: 'Budget approved and locked.' })
      router.refresh()
    })
  }

  return (
    <>
      <section aria-label="Totals" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Kpi label="Budgeted income" value={usd(totals.income, { whole: true })} />
        <Kpi label="Budgeted expenses" value={usd(totals.expense, { whole: true })} />
        <Kpi
          label={totals.net < 0 ? 'Planned deficit' : 'Planned surplus'}
          value={<span className={totals.net < 0 ? 'text-danger' : undefined}>{usd(totals.net, { whole: true })}</span>}
          hint="Income minus expenses"
        />
      </section>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle as="h2">Line items</CardTitle>
          <CardDescription>
            {editable ? 'One line per income or expense account, in whole dollars for the year.' : 'Locked — this budget is approved.'}
          </CardDescription>
        </CardHeader>
        {lines.length === 0 ? (
          <EmptyState
            variant="compact"
            title="No line items yet"
            description={editable ? 'Add a line for each account you plan to collect or spend from.' : 'This budget was approved without line items.'}
            action={
              editable ? (
                <Button variant="secondary" icon={<Plus aria-hidden />} onClick={addLine} disabled={accounts.length === 0}>
                  Add line
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableScroll>
            <table className="w-full border-separate border-spacing-0 text-left text-sm">
              <caption className="sr-only">Budget line items</caption>
              <thead>
                <tr>
                  {['Account', 'Amount', 'Notes'].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`border-b border-border bg-subtle px-4 py-2.5 text-xs font-medium text-muted ${i === 1 ? 'text-right' : ''}`}
                    >
                      {h}
                    </th>
                  ))}
                  {editable ? (
                    <th scope="col" className="border-b border-border bg-subtle px-4 py-2.5">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="border-b border-border px-4 py-2 align-top">
                      {editable ? (
                        <Field label="Account" hideLabel>
                        <Select
                          value={l.accountId}
                          onValueChange={(v) => {
                            const a = accounts.find((x) => x.id === v)
                            if (a) update(l.key, { accountId: a.id, accountLabel: a.label, accountType: a.type })
                          }}
                          className="min-w-[14rem]"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </Select>
                        </Field>
                      ) : (
                        <span className="text-foreground">{l.accountLabel}</span>
                      )}
                    </td>
                    <td className="border-b border-border px-4 py-2 text-right align-top">
                      {editable ? (
                        <div className="ml-auto w-36">
                          <Input
                            aria-label={`Amount for ${l.accountLabel}`}
                            aria-invalid={rowErrors[l.key] ? true : undefined}
                            inputMode="decimal"
                            prefix="$"
                            value={l.amount}
                            onChange={(e) => update(l.key, { amount: e.target.value })}
                            className="text-right"
                          />
                          {rowErrors[l.key] ? <p role="alert" className="mt-1 text-left text-xs text-danger">{rowErrors[l.key]}</p> : null}
                        </div>
                      ) : (
                        <span className="num text-foreground">{usd(Number(l.amount) || 0, { whole: true })}</span>
                      )}
                    </td>
                    <td className="border-b border-border px-4 py-2 align-top">
                      {editable ? (
                        <Input
                          aria-label={`Notes for ${l.accountLabel}`}
                          value={l.notes}
                          onChange={(e) => update(l.key, { notes: e.target.value })}
                          placeholder="Optional"
                          className="min-w-[10rem]"
                        />
                      ) : (
                        <span className="text-muted">{l.notes || '—'}</span>
                      )}
                    </td>
                    {editable ? (
                      <td className="border-b border-border px-2 py-2 text-right align-top">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${l.accountLabel}`}
                          onClick={() => {
                            setLines((prev) => prev.filter((x) => x.key !== l.key))
                            setDirty(true)
                          }}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {editable ? (
          <CardFooter className="flex-wrap justify-between gap-3">
            <Button variant="ghost" icon={<Plus aria-hidden />} onClick={addLine} disabled={saving || accounts.length === 0}>
              Add line
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
              <Button
                variant="secondary"
                icon={<Check aria-hidden />}
                onClick={approve}
                loading={approving}
                disabled={dirty || lines.length === 0 || saving}
                title={dirty ? 'Save your changes before approving' : undefined}
              >
                Approve
              </Button>
              <Button icon={<Save aria-hidden />} onClick={save} loading={saving} disabled={!dirty}>
                Save
              </Button>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </>
  )
}
