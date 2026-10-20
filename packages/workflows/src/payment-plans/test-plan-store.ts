/**
 * TEST-ONLY in-memory PlanStore (create.ts) with a ledger, so tests can
 * compare AR, income and a unit's balance before and after a plan. Entries
 * are kept even when reversed, as in the real ledger.
 */
import type { PlanEntryInput, PlanStore } from './create'
import type { PlanLedgerRefs, PlanLine } from './ledger'

export const REFS: PlanLedgerRefs = {
  fundOperating: 'f0000000-0000-4000-8000-000000000001',
  acctAR: 'a0000000-0000-4000-8000-000000001100',
  acctAssessmentIncome: 'a0000000-0000-4000-8000-000000004000',
  acctLateFeeIncome: 'a0000000-0000-4000-8000-000000004100',
}

export interface MemCharge {
  id: string
  unitId: string
  assessmentType: string
  dueDate: string
  amountCents: number
  status: string
  deleted: boolean
  /** Payment amounts applied, in cents. */
  payments: number[]
}

export interface MemEntry {
  id: string
  memo: string
  source: 'ar_payment' | 'reversing'
  sourceId: string
  status: 'posted' | 'reversed'
  lines: PlanLine[]
}

export interface MemPlan {
  id: string
  unitId: string
  totalCents: number
  installmentCount: number
  installmentCents: number
  startDate: string
}

export interface MemPlanStore extends PlanStore {
  charges: MemCharge[]
  plans: MemPlan[]
  entries: MemEntry[]
  /** Make the n-th postEntry call (1-based) fail. */
  failPostAt?: number
  /** Make claiming this charge fail (as if it was paid meanwhile). */
  failClaimFor?: string
}

let seq = 0
/** Hex ids, like real uuids (planKey needs 8 hex characters); `tag` is for reading only. */
const uuid = (_tag: string) => {
  seq += 1
  return `${seq.toString(16).padStart(8, '0')}-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

/** Seed a charge plus its billing entry (Dr AR / Cr income), as every billing path posts it. */
export function seedCharge(store: MemPlanStore, c: Omit<MemCharge, 'deleted' | 'payments' | 'status'> & Partial<Pick<MemCharge, 'status' | 'payments'>>): void {
  store.charges.push({ deleted: false, payments: [], status: 'open', ...c })
  const income = c.assessmentType === 'late_fee' ? REFS.acctLateFeeIncome : REFS.acctAssessmentIncome
  const amt = c.amountCents / 100
  store.entries.push({
    id: uuid('bill'),
    memo: `billed ${c.id}`,
    source: 'ar_payment',
    sourceId: c.id,
    status: 'posted',
    lines: [
      { accountId: REFS.acctAR, fundId: REFS.fundOperating, debit: amt, credit: 0 },
      { accountId: income, fundId: REFS.fundOperating, debit: 0, credit: amt },
    ],
  })
  for (const p of c.payments ?? []) {
    store.entries.push({
      id: uuid('pay'),
      memo: `payment on ${c.id}`,
      source: 'ar_payment',
      sourceId: uuid('pmt'),
      status: 'posted',
      lines: [
        { accountId: 'cash', fundId: REFS.fundOperating, debit: p / 100, credit: 0 },
        { accountId: REFS.acctAR, fundId: REFS.fundOperating, debit: 0, credit: p / 100 },
      ],
    })
  }
}

export function memPlanStore(): MemPlanStore {
  let posts = 0
  const s: MemPlanStore = {
    charges: [],
    plans: [],
    entries: [],
    async loadUnitCharges(unitId) {
      return s.charges
        .filter((c) => c.unitId === unitId)
        .map((c) => ({
          id: c.id,
          assessmentType: c.assessmentType,
          dueDate: c.dueDate,
          amountCents: c.amountCents,
          paidCents: c.payments.reduce((t, p) => t + p, 0),
          status: c.status,
          deleted: c.deleted,
        }))
    },
    async insertPlan(row) {
      const id = uuid('plan')
      s.plans.push({ id, ...row })
      return id
    },
    async claimCharge(chargeId, fromStatus) {
      if (s.failClaimFor === chargeId) return false
      const c = s.charges.find((x) => x.id === chargeId && x.status === fromStatus && !x.deleted)
      if (!c) return false
      c.status = 'waived'
      return true
    },
    async releaseCharge(chargeId, toStatus) {
      const c = s.charges.find((x) => x.id === chargeId && x.status === 'waived')
      if (c) c.status = toStatus
    },
    async insertInstallment(row) {
      const id = uuid('inst')
      s.charges.push({ id, unitId: row.unitId, assessmentType: 'special', dueDate: row.dueDate, amountCents: row.amountCents, status: 'open', deleted: false, payments: [] })
      return id
    },
    async postEntry(entry: PlanEntryInput) {
      posts += 1
      if (s.failPostAt === posts) return { ok: false, error: 'simulated trigger rejection' }
      const id = uuid('je')
      s.entries.push({ id, memo: entry.memo, source: 'ar_payment', sourceId: entry.sourceId, status: 'posted', lines: entry.lines })
      return { ok: true, id }
    },
    async reverseEntry(id, entry, reason) {
      s.entries.push({
        id: uuid('rev'),
        memo: `Reversal of ${entry.memo}: ${reason}`,
        source: 'reversing',
        sourceId: id,
        status: 'posted',
        lines: entry.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      })
      const orig = s.entries.find((e) => e.id === id)
      if (orig) orig.status = 'reversed'
    },
    async deleteInstallments(ids) {
      s.charges = s.charges.filter((c) => !ids.includes(c.id))
    },
    async deletePlan(id) {
      s.plans = s.plans.filter((p) => p.id !== id)
    },
  }
  return s
}

const cents = (n: number) => Math.round(n * 100)

/** Debits minus credits on `accountId`, in cents, over every entry (reversed ones too: their reversal nets them). */
export function accountBalanceCents(store: MemPlanStore, accountId: string): number {
  let t = 0
  for (const e of store.entries) for (const l of e.lines) if (l.accountId === accountId) t += cents(l.debit) - cents(l.credit)
  return t
}

/** What the unit owes, from the charges: the figure estoppel, letters and reminders read. */
export function unitOwedCents(store: MemPlanStore, unitId: string): number {
  return store.charges
    .filter((c) => c.unitId === unitId && !c.deleted && (c.status === 'open' || c.status === 'partial'))
    .reduce((t, c) => t + Math.max(0, c.amountCents - c.payments.reduce((a, p) => a + p, 0)), 0)
}

/** Every entry balances overall and per fund (validate_je_balances). */
export function unbalancedEntries(store: MemPlanStore): string[] {
  const bad: string[] = []
  for (const e of store.entries) {
    const byFund = new Map<string, number>()
    for (const l of e.lines) byFund.set(l.fundId, (byFund.get(l.fundId) ?? 0) + cents(l.debit) - cents(l.credit))
    if ([...byFund.values()].some((v) => v !== 0)) bad.push(e.id)
  }
  return bad
}
