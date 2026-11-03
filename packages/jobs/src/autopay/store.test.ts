import { describe, expect, it } from 'vitest'
import { createAutopayStore } from './store'
import type { AutopayEnrollment } from './run'

/** Chainable fake: every builder call returns itself; awaiting yields the table's rows. */
function fakeDb(tables: Record<string, unknown>) {
  return {
    from: (table: string) => {
      const result = { data: tables[table] ?? [], error: null }
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'not', 'gte', 'order', 'range', 'limit', 'contains']) b[m] = () => b
      b.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
      return b
    },
  }
}

const e = (over: Partial<AutopayEnrollment> = {}): AutopayEnrollment => ({
  id: 'enr', orgId: 'o', orgName: 'O', associationId: 'a', unitId: 'u', unitLabel: 'Unit 1', userId: 'me',
  ownerEmail: null, maxCents: 100000, includeOtherCharges: false, consecutiveFailures: 0, stillOwner: true,
  paymentsReady: true, today: '2026-12-01', chargesFrom: null,
  method: { id: 'pm', type: 'ach', brand: null, last4: null, stripePaymentMethodId: 'pm_x', stripeCustomerId: 'cus_x', stripeAccountId: 'acct_x', isActive: true },
  ...over,
})

const assessments = [
  { id: 'old', assessment_type: 'regular', due_date: '2026-06-01', amount: 100, payments: [] },
  { id: 'dues', assessment_type: 'regular', due_date: '2026-12-01', amount: 250, payments: [] },
]

describe('autopay store openCharges', () => {
  it('does not offer money an ACH debit already in flight will post', async () => {
    const db = fakeDb({
      assessments,
      online_payments: [
        { status: 'processing', source: 'resident', allocation: [{ assessment_id: 'dues', cents: 25000 }] },
        // an abandoned manual checkout is not money on its way
        { status: 'requires_action', source: 'resident', allocation: [{ assessment_id: 'old', cents: 10000 }] },
      ],
    })
    const got = await createAutopayStore(db).openCharges(e())
    expect(Object.fromEntries(got.map((c) => [c.id, c.remainingCents]))).toEqual({ old: 10000, dues: 0 })
  })

  it('an autopay attempt still waiting counts as in flight', async () => {
    const db = fakeDb({
      assessments,
      online_payments: [{ status: 'requires_action', source: 'autopay', allocation: [{ assessment_id: 'dues', cents: 25000 }] }],
    })
    const got = await createAutopayStore(db).openCharges(e())
    expect(got.find((c) => c.id === 'dues')!.remainingCents).toBe(0)
  })

  it("a buyer's autopay never takes the seller's charges", async () => {
    const db = fakeDb({ assessments, online_payments: [] })
    const got = await createAutopayStore(db).openCharges(e({ chargesFrom: '2026-09-01' }))
    expect(got.map((c) => c.id)).toEqual(['dues'])
  })
})

describe('autopay store listActive', () => {
  const row = (methodOver: Record<string, unknown> = {}) => ({
    id: 'enr', organization_id: 'o', association_id: 'a', unit_id: 'u', user_id: 'me', max_cents: 1000,
    include_other_charges: false, consecutive_failures: 0,
    method: { id: 'pm', method_type: 'ach', brand: null, last4: null, stripe_payment_method_id: 'pm_x', stripe_customer_id: 'cus_x',
      stripe_account_id: 'acct_x', is_active: true, user_id: 'me', association_id: 'a', ...methodOver },
    org: { name: 'O' }, unit: { unit_number: '1' }, assoc: {},
  })
  const base = (r: unknown, acct = 'acct_x', own: unknown[] = [{ unit_id: 'u', owner_user_id: 'me', valid_from: '2026-09-01', source: 'sale' }]) =>
    fakeDb({
      autopay_enrollments: [r],
      association_stripe_accounts: [{ association_id: 'a', stripe_account_id: acct, charges_enabled: true, online_payments_enabled: true }],
      ownerships: own,
      profiles: [],
    })

  it('ready when the method sits on the association\'s current account and belongs to the owner', async () => {
    const [x] = await createAutopayStore(base(row())).listActive()
    expect(x!.paymentsReady).toBe(true)
    expect(x!.chargesFrom).toBe('2026-09-01')
  })

  it('not ready when the association moved to a different Stripe account', async () => {
    const [x] = await createAutopayStore(base(row(), 'acct_new')).listActive()
    expect(x!.paymentsReady).toBe(false)
  })

  it('not ready when the method belongs to someone else or another association', async () => {
    expect((await createAutopayStore(base(row({ user_id: 'other' }))).listActive())[0]!.paymentsReady).toBe(false)
    expect((await createAutopayStore(base(row({ association_id: 'b' }))).listActive())[0]!.paymentsReady).toBe(false)
  })

  it('an ownership that did not begin with a sale has no window', async () => {
    const own = [{ unit_id: 'u', owner_user_id: 'me', valid_from: '2026-09-01', source: 'import' }]
    expect((await createAutopayStore(base(row(), 'acct_x', own)).listActive())[0]!.chargesFrom).toBeNull()
  })
})
