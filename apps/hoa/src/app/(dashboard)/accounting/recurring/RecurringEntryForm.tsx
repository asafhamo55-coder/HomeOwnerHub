'use client'

import { useState } from 'react'
import { Alert, Field, Fieldset, Input, Select } from '@homeowner-portal/ui'
import { CADENCES, type EditLine } from '@/lib/accounting/recurring-edit'
import { usd } from '@/lib/money/format'
import { humanize } from '@/lib/money/status'
import type { AccountOption, FundOption } from './model'

export interface RecurringFormValue {
  memo: string
  cadence: string
  nextRunDate: string
  lines: EditLine[]
}

interface LineDraft {
  accountId: string
  fundId: string
  debit: string
  credit: string
}

const toText = (n: number) => (n > 0 ? String(Math.round(n * 100) / 100) : '')
const toNumber = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : Number.NaN
}

/**
 * The edit form for one recurring entry (BL-081): description, how often,
 * next run, and each line's account (and fund, when there is more than
 * one) with its debit or credit. Field errors come from the server
 * action's `fieldErrors` (lib/accounting/recurring-edit.ts keys). Rendered
 * inside the Edit sheet, and on its own in the previews.
 */
export function RecurringEntryForm({
  formId,
  initial,
  accounts,
  funds,
  today,
  errors,
  pending,
  onSubmit,
}: {
  formId: string
  initial: RecurringFormValue
  accounts: AccountOption[]
  funds: FundOption[]
  today: string
  errors: Record<string, string>
  pending: boolean
  onSubmit: (value: RecurringFormValue) => void
}) {
  const [memo, setMemo] = useState(initial.memo)
  const [cadence, setCadence] = useState(initial.cadence)
  const [nextRunDate, setNextRunDate] = useState(initial.nextRunDate)
  const [lines, setLines] = useState<LineDraft[]>(
    initial.lines.map((l) => ({ accountId: l.accountId, fundId: l.fundId, debit: toText(l.debit), credit: toText(l.credit) })),
  )
  const showFund = funds.length > 1

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const sum = (key: 'debit' | 'credit') => lines.reduce((s, l) => s + (Number.isFinite(toNumber(l[key] || '0')) ? Math.round(toNumber(l[key] || '0') * 100) : 0), 0)
  const debits = sum('debit')
  const credits = sum('credit')
  const off = debits - credits

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      memo,
      cadence,
      nextRunDate,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        fundId: l.fundId,
        debit: l.debit.trim() ? toNumber(l.debit) : 0,
        credit: l.credit.trim() ? toNumber(l.credit) : 0,
      })),
    })
  }

  return (
    <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
      <Field label="Description" required error={errors.memo} hint="Shown on every copy in the ledger.">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={2000} disabled={pending} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repeats" required error={errors.cadence}>
          <Select value={cadence} onValueChange={setCadence} disabled={pending}>
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next run" required error={errors.nextRunDate} hint="Today or later.">
          <Input type="date" value={nextRunDate} min={today} onChange={(e) => setNextRunDate(e.target.value)} disabled={pending} required />
        </Field>
      </div>

      <Fieldset legend="Lines" hint="Each copy posts these lines. Debits and credits must be equal." error={errors.lines}>
        <ol className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted">Line {i + 1}</p>
              <div className={showFund ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
                <Field label="Account" required error={errors[`lines.${i}.account`]}>
                  <Select value={l.accountId || undefined} onValueChange={(v) => setLine(i, { accountId: v })} placeholder="Choose an account" disabled={pending}>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {showFund ? (
                  <Field label="Fund" required error={errors[`lines.${i}.fund`]}>
                    <Select value={l.fundId || undefined} onValueChange={(v) => setLine(i, { fundId: v })} disabled={pending}>
                      {funds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Debit" error={errors[`lines.${i}.amount`]}>
                  <Input inputMode="decimal" prefix="$" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value })} disabled={pending} />
                </Field>
                <Field label="Credit">
                  <Input inputMode="decimal" prefix="$" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value })} disabled={pending} />
                </Field>
              </div>
            </li>
          ))}
        </ol>
        <p className="num mt-3 text-sm text-muted" aria-live="polite">
          Debits {usd(debits / 100)} · Credits {usd(credits / 100)}
          {off !== 0 ? <span className="text-danger"> · Out of balance by {usd(Math.abs(off) / 100)}</span> : null}
        </p>
      </Fieldset>

      <Alert variant="info" title="Entries already posted don’t change">
        The new lines apply from the next run. The original entry and every copy already in the ledger stay as they are.
      </Alert>
    </form>
  )
}
