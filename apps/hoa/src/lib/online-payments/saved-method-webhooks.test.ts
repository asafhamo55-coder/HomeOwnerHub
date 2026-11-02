import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))

import {
  handleMandateUpdated,
  handlePaymentMethodDetached,
  handleSetupIntentSucceeded,
  savedMethodEventHandlers,
  type ConnectEventLike,
  type HandlerDb,
} from './saved-method-webhooks'
import type { SavedMethodsStripePort } from './saved-methods'

type R = Record<string, unknown>

/** Tiny in-memory table store that understands the query shapes the handlers use. */
function fakeDb(seed: Record<string, R[]>) {
  const tables: Record<string, R[]> = { audit_log: [], autopay_enrollments: [], online_payment_methods: [], association_stripe_accounts: [], ...seed }
  let n = 0
  const db: HandlerDb = {
    from(table: string) {
      const filters: Array<[string, unknown]> = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let patch: R = {}
      const rows = () => (tables[table] ??= [])
      const match = () => rows().filter((r) => filters.every(([c, v]) => r[c] === v))
      const run = () => {
        if (mode === 'update') {
          const hit = match()
          hit.forEach((r) => Object.assign(r, patch))
          return { data: hit.map((r) => ({ ...r })), error: null }
        }
        if (mode === 'insert') {
          const row: R = { id: `row-${++n}`, is_active: true, ...patch }
          const dupe = table === 'online_payment_methods' && rows().some((r) => r.stripe_account_id === row.stripe_account_id && r.stripe_payment_method_id === row.stripe_payment_method_id)
          if (dupe) return { data: null, error: { code: '23505' } }
          rows().push(row)
          return { data: { id: row.id }, error: null }
        }
        return { data: match().map((r) => ({ ...r })), error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (row: R) => ((mode = 'insert'), (patch = row), q),
        update: (row: R) => ((mode = 'update'), (patch = row), q),
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        in: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const res = run()
          return Array.isArray(res.data) ? { data: res.data[0] ?? null, error: res.error } : res
        },
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
      }
      return q as never
    },
  }
  return { db, tables }
}

const ACCT = 'acct_12345678'
const stripe: SavedMethodsStripePort = {
  createCustomer: vi.fn(),
  createSetupIntent: vi.fn(),
  detachPaymentMethod: vi.fn(),
  retrievePaymentMethod: vi.fn(async (_a, id) => ({ id, type: 'card' as const, brand: 'visa', last4: '4242', expMonth: 8, expYear: 2030 })),
}
const setupEvent = (over: Partial<ConnectEventLike> = {}): ConnectEventLike => ({
  id: 'evt_1',
  type: 'setup_intent.succeeded',
  account: ACCT,
  data: { object: { id: 'seti_1', customer: 'cus_1', payment_method: 'pm_1', metadata: { organization_id: 'org-1', association_id: 'assoc-1', user_id: 'user-1' } } },
  ...over,
})
const seedAcct = { association_stripe_accounts: [{ id: 'a1', association_id: 'assoc-1', organization_id: 'org-1', stripe_account_id: ACCT }] }

beforeEach(() => vi.clearAllMocks())

describe('setup_intent.succeeded', () => {
  it('stores the method as the default and audits it', async () => {
    const { db, tables } = fakeDb(seedAcct)
    expect(await handleSetupIntentSucceeded(setupEvent(), { stripe, db })).toBe('applied')
    expect(tables.online_payment_methods).toHaveLength(1)
    expect(tables.online_payment_methods[0]).toMatchObject({ last4: '4242', is_default: true, method_type: 'card', user_id: 'user-1' })
    expect(tables.audit_log).toHaveLength(1)
  })

  it('is idempotent on redelivery', async () => {
    const { db, tables } = fakeDb(seedAcct)
    await handleSetupIntentSucceeded(setupEvent(), { stripe, db })
    expect(await handleSetupIntentSucceeded(setupEvent(), { stripe, db })).toBe('duplicate')
    expect(tables.online_payment_methods).toHaveLength(1)
  })

  it('does not make a second method the default', async () => {
    const { db, tables } = fakeDb(seedAcct)
    await handleSetupIntentSucceeded(setupEvent(), { stripe, db })
    const e2 = setupEvent()
    ;(e2.data.object as { payment_method: string }).payment_method = 'pm_2'
    await handleSetupIntentSucceeded(e2, { stripe, db })
    expect(tables.online_payment_methods.map((r) => r.is_default)).toEqual([true, false])
  })

  it('ignores an event from an account that is not the association’s', async () => {
    const { db, tables } = fakeDb(seedAcct)
    expect(await handleSetupIntentSucceeded(setupEvent({ account: 'acct_other0000' }), { stripe, db })).toBe('ignored')
    expect(tables.online_payment_methods).toHaveLength(0)
  })
})

describe('payment_method.detached and mandate.updated', () => {
  const seedMethod = () => ({
    online_payment_methods: [{ id: 'm1', organization_id: 'org-1', user_id: 'user-1', stripe_account_id: ACCT, stripe_payment_method_id: 'pm_1', stripe_mandate_id: 'mandate_1', is_active: true, is_default: true }],
    autopay_enrollments: [{ id: 'ap1', payment_method_id: 'm1', status: 'active' }],
  })

  it('detached deactivates the method, clears default, pauses autopay; redelivery is a no-op', async () => {
    const { db, tables } = fakeDb(seedMethod())
    const ev: ConnectEventLike = { id: 'e', type: 'payment_method.detached', account: ACCT, data: { object: { id: 'pm_1' } } }
    expect(await handlePaymentMethodDetached(ev, { db })).toBe('applied')
    expect(tables.online_payment_methods[0]).toMatchObject({ is_active: false, is_default: false })
    expect(tables.autopay_enrollments[0].status).toBe('paused')
    expect(await handlePaymentMethodDetached(ev, { db })).toBe('duplicate')
  })

  it('an inactive mandate deactivates the bank account; an active one is ignored', async () => {
    const { db, tables } = fakeDb(seedMethod())
    const mk = (status: string): ConnectEventLike => ({ id: 'e', type: 'mandate.updated', account: ACCT, data: { object: { id: 'mandate_1', status } } })
    expect(await handleMandateUpdated(mk('active'), { db })).toBe('ignored')
    expect(tables.online_payment_methods[0].is_active).toBe(true)
    expect(await handleMandateUpdated(mk('inactive'), { db })).toBe('applied')
    expect(tables.online_payment_methods[0].is_active).toBe(false)
  })

  it('does not touch another account’s method with the same id', async () => {
    const { db, tables } = fakeDb(seedMethod())
    const ev: ConnectEventLike = { id: 'e', type: 'payment_method.detached', account: 'acct_other0000', data: { object: { id: 'pm_1' } } }
    expect(await handlePaymentMethodDetached(ev, { db })).toBe('duplicate')
    expect(tables.online_payment_methods[0].is_active).toBe(true)
  })
})

describe('registration map', () => {
  it('covers exactly the three events', () => {
    expect(Object.keys(savedMethodEventHandlers(stripe)).sort()).toEqual(['mandate.updated', 'payment_method.detached', 'setup_intent.succeeded'])
  })
})
