import { describe, expect, it, vi } from 'vitest'

const plans = vi.hoisted(() => ({ ids: [] as string[], fail: false }))
vi.mock('@homeowner-portal/workflows/payment-plans', () => ({
  loadInstallments: vi.fn(async () => {
    if (plans.fail) throw new Error('boom')
    return plans.ids.map((assessmentId) => ({ assessmentId }))
  }),
}))

import { inFlightCents, supabaseAttemptStore, type Db } from './attempt-store'

/** A chainable fake: every builder method returns itself; awaiting or maybeSingle() yields the table's rows. */
function fakeDb(tables: Record<string, unknown>): Db {
  const builder = (table: string) => {
    const result = { data: tables[table] ?? null, error: null }
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'range']) b[m] = () => b
    b.maybeSingle = async () => result
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
    return b
  }
  return { from: builder, rpc: async () => ({ data: null, error: null }) } as unknown as Db
}

const tables = {
  units: { id: 'u1', organization_id: 'o1', association_id: 'a1' },
  associations: { id: 'a1', name: 'Maple Grove', state: 'GA', governing_law_state: 'GA', compliance_settings: null },
  association_stripe_accounts: null,
  assessments: [
    { id: 'plan1', assessment_type: 'special', due_date: '2026-12-01', amount: 100, payments: [] },
    { id: 'dues1', assessment_type: 'regular', due_date: '2027-01-01', amount: 250, payments: [{ amount: 50 }] },
  ],
}

describe('supabaseAttemptStore.loadContext', () => {
  it('flags payment-plan installments the same way the board lump-payment flow does', async () => {
    plans.ids = ['plan1']
    plans.fail = false
    const ctx = await supabaseAttemptStore(fakeDb(tables)).loadContext('u1')
    const byId = Object.fromEntries(ctx!.charges.map((c) => [c.id, c]))
    expect(byId.plan1).toMatchObject({ type: 'special', remainingCents: 10000, planInstallment: true })
    expect(byId.dues1).toMatchObject({ remainingCents: 20000, planInstallment: false })
  })

  it('refuses (throws) when the installment read fails, never guessing', async () => {
    plans.fail = true
    await expect(supabaseAttemptStore(fakeDb(tables)).loadContext('u1')).rejects.toThrow('installment read failed')
  })
})

describe('supabaseAttemptStore.loadContext: what a resident may be offered', () => {
  const mk = (extra: Record<string, unknown>) => fakeDb({ ...tables, ...extra })

  it('a buyer is not offered the seller\'s charges (sale window)', async () => {
    plans.ids = []
    plans.fail = false
    const ctx = await supabaseAttemptStore(mk({})).loadContext('u1', { chargesFrom: '2026-12-15' })
    expect(ctx!.charges.map((c) => c.id)).toEqual(['dues1'])
  })

  it('without a window the whole unit history is offered', async () => {
    plans.ids = []
    const ctx = await supabaseAttemptStore(mk({})).loadContext('u1', { chargesFrom: null })
    expect(ctx!.charges.map((c) => c.id)).toEqual(['plan1', 'dues1'])
  })

  it('money already on its way by bank debit is not offered twice', async () => {
    plans.ids = []
    const ctx = await supabaseAttemptStore(
      mk({ online_payments: [{ allocation: [{ assessment_id: 'dues1', cents: 20000 }, { kind: 'credit', cents: 5 }] }] }),
    ).loadContext('u1')
    const byId = Object.fromEntries(ctx!.charges.map((c) => [c.id, c.remainingCents]))
    expect(byId).toEqual({ plan1: 10000, dues1: 0 })
  })
})

describe('inFlightCents', () => {
  it('sums per charge and ignores credit parts and junk', () => {
    const m = inFlightCents([
      { allocation: [{ assessment_id: 'a', cents: 100 }, { assessment_id: 'b', cents: 5 }] },
      { allocation: [{ assessment_id: 'a', cents: 50 }, { kind: 'credit', cents: 9 }, { assessment_id: 'c', cents: -1 }] },
      { allocation: 'nope' },
    ])
    expect(Object.fromEntries(m)).toEqual({ a: 150, b: 5 })
  })
})
