import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  actor: { id: 'user-1' as string | null, impersonating: false },
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  rows: {} as Record<string, Record<string, unknown> | null>,
  detached: [] as string[],
  setupInputs: [] as Array<{ usage?: string }>,
  auditRows: [] as Array<{ created_at: string }>,
}))

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => h.actor) }))
vi.mock('@/lib/resident', () => ({ getResidentUnits: vi.fn(async () => [{ association_id: 'assoc-1' }]) }))
vi.mock('@/lib/online-payments/saved-methods-deps', () => ({
  deps: {
    port: () => ({
      createCustomer: vi.fn(async () => ({ id: 'cus_new' })),
      createSetupIntent: vi.fn(async (_a: string, input: { usage?: string }) => (h.setupInputs.push(input), { id: 'seti_1', clientSecret: 'secret' })),
      retrievePaymentMethod: vi.fn(),
      detachPaymentMethod: vi.fn(async (_a: string, pm: string) => void h.detached.push(pm)),
    }),
    db: () => ({
      from(table: string) {
        const filters: Array<[string, unknown]> = []
        let patch: Record<string, unknown> | null = null
        const q: Record<string, unknown> = {
          select: () => q,
          insert: () => q,
          update: (p: Record<string, unknown>) => ((patch = p), q),
          eq: (c: string, v: unknown) => (filters.push([c, v]), q),
          in: () => q,
          limit: () => q,
          gte: () => q,
          order: () => q,
          maybeSingle: async () => ({ data: h.rows[table] ?? null, error: null }),
          then: (ok: (v: unknown) => unknown) => {
            if (patch) h.updates.push({ table, patch, filters })
            return Promise.resolve({ data: table === 'audit_log' ? h.auditRows : null, error: null }).then(ok)
          },
        }
        return q
      },
    }),
  },
}))

import { makeDefaultMethod, removeMethod, startAddMethod } from './actions'

const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  h.actor = { id: 'user-1', impersonating: false }
  h.updates = []
  h.rows = {}
  h.detached = []
  h.setupInputs = []
  h.auditRows = []
})

describe('saved method actions', () => {
  it('refuses every change while an admin is viewing as the homeowner', async () => {
    h.actor = { id: 'user-1', impersonating: true }
    for (const res of [await startAddMethod(), await removeMethod({ id: ID }), await makeDefaultMethod({ id: ID })]) {
      expect(res.ok).toBe(false)
    }
    expect(h.updates).toHaveLength(0)
    expect(h.detached).toHaveLength(0)
  })

  it('rejects a malformed id', async () => {
    expect((await removeMethod({ id: 'nope' })).ok).toBe(false)
  })

  it('does not remove a method that is not the caller’s (lookup is scoped to the caller)', async () => {
    h.rows.online_payment_methods = null
    const res = await removeMethod({ id: ID })
    expect(res.ok).toBe(false)
    expect(h.detached).toHaveLength(0)
  })

  it('remove detaches at Stripe, then deactivates and clears the default, scoped to the caller', async () => {
    h.rows.online_payment_methods = { id: ID, organization_id: 'org-1', stripe_account_id: 'acct_x', stripe_payment_method_id: 'pm_9' }
    h.rows.autopay_enrollments = null
    expect(await removeMethod({ id: ID })).toEqual({ ok: true })
    expect(h.detached).toEqual(['pm_9'])
    const u = h.updates.find((x) => x.table === 'online_payment_methods')
    expect(u?.patch).toEqual({ is_active: false, is_default: false })
    expect(u?.filters).toContainEqual(['user_id', 'user-1'])
  })

  it('refuses to remove a method autopay uses', async () => {
    h.rows.online_payment_methods = { id: ID, organization_id: 'org-1', stripe_account_id: 'acct_x', stripe_payment_method_id: 'pm_9' }
    h.rows.autopay_enrollments = { id: 'ap1' }
    const res = await removeMethod({ id: ID })
    expect(res.ok).toBe(false)
    expect(h.detached).toHaveLength(0)
  })

  it('make default clears the old default before setting the new one', async () => {
    h.rows.online_payment_methods = { id: ID, association_id: 'assoc-1' }
    expect(await makeDefaultMethod({ id: ID })).toEqual({ ok: true })
    expect(h.updates.map((u) => u.patch.is_default)).toEqual([false, true])
  })

  it('start refuses until the board has turned online payments on', async () => {
    h.rows.association_stripe_accounts = { organization_id: 'org-1', stripe_account_id: 'acct_x', online_payments_enabled: false, charges_enabled: true }
    expect((await startAddMethod()).ok).toBe(false)
    h.rows.association_stripe_accounts = { organization_id: 'org-1', stripe_account_id: 'acct_x', online_payments_enabled: true, charges_enabled: true }
    expect(await startAddMethod()).toEqual({ ok: true, clientSecret: 'secret', stripeAccount: 'acct_x' })
  })

  it('GAP 1: a saved method is set up for off-session use, because autopay charges it without the owner present', async () => {
    h.rows.association_stripe_accounts = { organization_id: 'org-1', stripe_account_id: 'acct_x', online_payments_enabled: true, charges_enabled: true }
    expect((await startAddMethod()).ok).toBe(true)
    expect(h.setupInputs).toHaveLength(1)
    expect(h.setupInputs[0]!.usage).toBe('off_session')
  })

  it('start stops a person who keeps trying (card-testing guard) before Stripe is called', async () => {
    h.rows.association_stripe_accounts = { organization_id: 'org-1', stripe_account_id: 'acct_x', online_payments_enabled: true, charges_enabled: true }
    const now = Date.now()
    h.auditRows = Array.from({ length: 5 }, (_, i) => ({ created_at: new Date(now - (i + 1) * 60_000).toISOString() }))
    const res = await startAddMethod()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/try again/i)
  })
})
