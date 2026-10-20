// BL-126 — an opening balance waiting on the board, as an approval_requests
// row (migration 0060, no new table).
//
//   action_type   accounting.opening_balances
//   subject_type  opening_balances
//   subject_id    derived from (association, start date) — see core.ts —
//                 so the live-subject unique index allows ONE live
//                 proposal per association and date: re-running the
//                 wizard finds it instead of filing a second
//   payload       OpeningPayload below: the journal entry's lines and the
//                 per-home charges, in cents
//   amount        the entry's total debits
//
// ONE proposal carries everything: the approval executor contract
// (packages/workflows approvals) takes any payload, and postJournalEntry
// takes any number of lines across funds as long as each fund balances.
// So there is no need for one proposal per fund.
//
// Pure: zod only, so the approvals inbox (loaded by tests/integration) can
// read it.

import { z } from 'zod'

export const OPENING_ACTION = 'accounting.opening_balances'
export const OPENING_WORKFLOW = 'opening_balances'
export const OPENING_SUBJECT = 'opening_balances'

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Cents = z.number().int().min(0)

export const OpeningPayloadSchema = z.object({
  version: z.literal(1),
  associationId: z.string().uuid(),
  cutoverDate: Iso,
  /** Due date of the per-home charges (late fees run on charges past due). */
  chargesDueDate: Iso,
  fiscalPeriodId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        fundId: z.string().uuid(),
        debitCents: Cents,
        creditCents: Cents,
        label: z.string().max(200),
      }),
    )
    .min(2)
    .max(200),
  charges: z.array(z.object({ unitId: z.string().uuid(), cents: z.number().int().positive() })).max(5000),
  /** The receivable account the charges sum to (null when there are none). */
  arAccountId: z.string().uuid().nullable(),
  /** Per fund, for the approval card. */
  funds: z
    .array(z.object({ fundId: z.string().uuid(), name: z.string().max(200), equityCents: z.number().int() }))
    .max(50),
})
export type OpeningPayload = z.infer<typeof OpeningPayloadSchema>

export function readOpeningPayload(raw: unknown): OpeningPayload | null {
  const parsed = OpeningPayloadSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "Opening balances as of 2026-01-01 — 2 funds, 14 homes owe $3,210.00": the row's summary. */
export function openingSummary(p: Pick<OpeningPayload, 'cutoverDate' | 'funds' | 'charges'>): string {
  const homes = p.charges.length
  const owed = p.charges.reduce((n, c) => n + c.cents, 0)
  const parts = [`${p.funds.length} ${p.funds.length === 1 ? 'fund' : 'funds'}`]
  if (homes > 0) parts.push(`${homes} ${homes === 1 ? 'home owes' : 'homes owe'} ${usd(owed)}`)
  return `Opening balances as of ${p.cutoverDate} — ${parts.join(', ')}`.slice(0, 300)
}

/** The approval card's second line: what approving does. */
export function openingDetail(p: OpeningPayload): string {
  const funds = p.funds
    .map((f) => `${f.name} ${f.equityCents >= 0 ? 'fund balance' : 'fund deficit'} ${usd(Math.abs(f.equityCents))}`)
    .join('; ')
  const homes = p.charges.length
  return `Approving posts one journal entry (${p.lines.length} lines, balanced in every fund: ${funds})${homes > 0 ? ` and adds an opening-balance charge to ${homes} ${homes === 1 ? 'home' : 'homes'}` : ''}. Review it on the opening balances page first.`
}

export const OPENING_HREF = '/accounting/opening-balances'
