'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Select, Textarea } from '@homeowner-portal/ui'
import { cpaMarkPeriodReviewed, cpaProposeEntry } from '@/lib/professionals/actions'

/** "Reviewed by CPA" note for one fiscal period. Goes to the board's Approvals. */
export function ReviewForm({ fiscalPeriodId }: { fiscalPeriodId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const r = await cpaMarkPeriodReviewed({ fiscalPeriodId, note })
      if (!r.ok) return setMsg({ ok: false, text: r.error })
      setNote('')
      setMsg({ ok: true, text: 'Sent to the board. It shows as reviewed once they approve it.' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label="Review note" hint="What you reviewed and what you found.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} required />
      </Field>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <Button type="submit" size="sm" loading={pending}>
        Mark as reviewed
      </Button>
    </form>
  )
}

interface Option {
  id: string
  label: string
  associationId: string
}

interface Line {
  accountId: string
  fundId: string
  side: 'debit' | 'credit'
  amount: string
}

const emptyLine = (accounts: Option[], funds: Option[]): Line => ({
  accountId: accounts[0]?.id ?? '',
  fundId: funds[0]?.id ?? '',
  side: 'debit',
  amount: '',
})

/** Propose an adjusting entry. It posts only when the board approves it. */
export function EntryForm({
  associationId,
  fiscalPeriodId,
  accounts,
  funds,
}: {
  associationId: string
  fiscalPeriodId: string
  accounts: Option[]
  funds: Option[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const accts = accounts.filter((a) => a.associationId === associationId)
  const fnds = funds.filter((f) => f.associationId === associationId)
  const [date, setDate] = useState('')
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine(accts, fnds), { ...emptyLine(accts, fnds), side: 'credit' }])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    start(async () => {
      const r = await cpaProposeEntry({
        associationId,
        fiscalPeriodId,
        entryDate: date,
        memo,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          fundId: l.fundId,
          debit: l.side === 'debit' ? Number(l.amount) || 0 : 0,
          credit: l.side === 'credit' ? Number(l.amount) || 0 : 0,
        })),
      })
      if (!r.ok) return setMsg({ ok: false, text: r.error })
      setMemo('')
      setMsg({ ok: true, text: 'Sent to the board. It posts to the ledger only when they approve it.' })
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Entry date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Why is it needed?" required>
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={2000} required />
        </Field>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr]">
          <Select aria-label={`Line ${i + 1} account`} value={l.accountId} onValueChange={(v) => set(i, { accountId: v })}>
            {accts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Select aria-label={`Line ${i + 1} fund`} value={l.fundId} onValueChange={(v) => set(i, { fundId: v })}>
            {fnds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select aria-label={`Line ${i + 1} side`} value={l.side} onValueChange={(v) => set(i, { side: v as Line['side'] })}>
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </Select>
          <Input aria-label={`Line ${i + 1} amount`} inputMode="decimal" placeholder="0.00" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine(accts, fnds)])}>
          Add a line
        </Button>
        <Button type="submit" size="sm" loading={pending}>
          Propose entry
        </Button>
      </div>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
    </form>
  )
}
