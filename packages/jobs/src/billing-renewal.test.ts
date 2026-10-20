import { describe, expect, it, vi } from 'vitest'
import { PRICING_V2, planPriceCents } from '@homeowner-portal/billing'
import {
  RENEWAL_NOTICE_AUDIT_ACTION,
  RENEWAL_SWITCH_AUDIT_ACTION,
  buildRenewalNotice,
  runRenewalJob,
  type RenewalDeps,
} from './billing-renewal'
import type { SubscriptionSnapshot } from './billing-stripe-port'
import { fakeDb, fakeStripe, filterValue, silentLogger, type FakeQuery } from './billing-fake.test-util'

// BL-104 grandfathered renewal: the 30-day board notice (once per term) and
// the switch to Complete at renewal. Stripe is a fake port, the sender a
// mock, the db an in-memory query fake. No real Stripe, email or database.

const RENEWS = new Date('2026-12-01T00:00:00.000Z')
const PRICES = { hoa_complete_monthly: 'price_cm', hoa_complete_annual: 'price_ca' }

function legacySub(over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id: 'sub_1',
    status: 'active',
    // Annual: renewal = current_period_end.
    startedAt: new Date('2025-12-01T00:00:00Z'),
    currentPeriodEnd: RENEWS,
    cadence: 'annual',
    itemId: 'si_1',
    quantity: 41,
    lookupKey: 'hoa_per_door_annual',
    ...over,
  }
}

interface WorldOpts {
  plan?: string
  homes?: number
  members?: Array<{ user_id: string; role: string }>
  profiles?: Array<{ id: string; email: string | null }>
  claimInsertError?: boolean
}

function world(o: WorldOpts = {}) {
  const audit: Record<string, unknown>[] = []
  const f = fakeDb((q: FakeQuery) => {
    if (q.table === 'orgs') {
      return { data: [{ id: 'org-1', name: 'Maple Court HOA', plan: o.plan ?? 'annual', stripe_sub_id: 'sub_1' }], error: null }
    }
    if (q.table === 'hoa_properties') return { count: o.homes ?? 48, error: null }
    if (q.table === 'org_members') {
      // The real query filters by role; the fake returns everything, so the
      // in-code role re-check is what keeps residents out.
      return {
        data: o.members ?? [
          { user_id: 'u-board', role: 'board' },
          { user_id: 'u-admin', role: 'admin' },
          { user_id: 'u-res', role: 'resident' },
        ],
        error: null,
      }
    }
    if (q.table === 'profiles') {
      const ids = filterValue(q, 'in', 'id') as string[]
      const all = o.profiles ?? [
        { id: 'u-board', email: 'board@hoa.test' },
        { id: 'u-admin', email: 'admin@hoa.test' },
        { id: 'u-res', email: 'resident@hoa.test' },
      ]
      return { data: all.filter((p) => ids.includes(p.id)), error: null }
    }
    if (q.table === 'audit_log' && q.op === 'insert') {
      if (o.claimInsertError && q.row!.action === RENEWAL_NOTICE_AUDIT_ACTION) return { error: { code: '42501' } }
      audit.push(q.row!)
      return { error: null }
    }
    if (q.table === 'audit_log') {
      const term = (filterValue(q, 'contains', 'metadata') as { term: string }).term
      const action = filterValue(q, 'eq', 'action')
      return { data: audit.filter((a) => a.action === action && (a.metadata as { term: string }).term === term), error: null }
    }
    throw new Error(`unexpected ${q.table}`)
  })
  return { ...f, audit }
}

function deps(stripe: ReturnType<typeof fakeStripe>, sendEmail = vi.fn(async () => ({ ok: true }))): RenewalDeps & { sendEmail: typeof sendEmail } {
  return {
    stripe: () => stripe.port,
    sendEmail,
    appUrl: (p: string) => `https://hoa.test${p}`,
    orgSandbox: async () => false,
  }
}

const at = (iso: string) => ({ pricingV2: true, now: Date.parse(iso), logger: silentLogger() })

describe('runRenewalJob', () => {
  it('ships off: with PRICING_V2 off it is a no-op — no read, no Stripe, no email', async () => {
    expect(PRICING_V2).toBe(false)
    const w = world()
    const s = fakeStripe({ sub_1: legacySub() }, PRICES)
    const d = deps(s)
    const stripe = vi.fn(d.stripe)
    const r = await runRenewalJob(w.db, { ...d, stripe }, { now: Date.parse('2026-11-05T14:00:00Z'), logger: silentLogger() })
    expect(r).toMatchObject({ skipped: 'pricing_v2_off', noticesSent: 0, switched: 0 })
    expect(w.queries).toHaveLength(0)
    expect(stripe).not.toHaveBeenCalled()
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('more than 30 days out: nothing', async () => {
    const w = world()
    const s = fakeStripe({ sub_1: legacySub() }, PRICES)
    const d = deps(s)
    const r = await runRenewalJob(w.db, d, at('2026-10-31T14:00:00Z'))
    expect(r).toMatchObject({ checked: 1, noticesSent: 0, switched: 0 })
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('reads only legacy orgs with a subscription', async () => {
    const w = world()
    await runRenewalJob(w.db, deps(fakeStripe({ sub_1: legacySub() }, PRICES)), at('2026-10-31T14:00:00Z'))
    const q = w.queries.find((x) => x.table === 'orgs')!
    expect(filterValue(q, 'in', 'plan')).toEqual(['monthly', 'annual', 'legacy_per_door'])
    expect(filterValue(q, 'not', 'stripe_sub_id')).toEqual(['is', null])
  })

  it('30 days out: emails the board (never residents) once per term, with the Complete price', async () => {
    const w = world({ homes: 48 })
    const s = fakeStripe({ sub_1: legacySub() }, PRICES)
    const d = deps(s)
    const r = await runRenewalJob(w.db, d, at('2026-11-01T14:00:00Z'))
    expect(r).toMatchObject({ noticesSent: 1, emailsSent: 2, switched: 0 })
    const tos = d.sendEmail.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to)
    expect(tos.sort()).toEqual(['admin@hoa.test', 'board@hoa.test'])
    expect(tos).not.toContain('resident@hoa.test')
    const [email, opts] = d.sendEmail.mock.calls[0] as unknown as [{ subject: string; text: string }, { orgSandbox: boolean; ref: string }]
    // Complete 1–50, annual: $990.
    expect(planPriceCents('complete', 'annual', 48)).toBe(99000)
    expect(email.subject).toBe('Your plan changes on December 1, 2026: Complete at $990 a year')
    expect(email.text).toContain('48 homes on file (1–50 doors)')
    expect(email.text).toContain('https://hoa.test/settings/billing')
    expect(opts).toEqual({ orgSandbox: false, ref: 'renewal:org-1' })
    expect(w.audit).toEqual([
      expect.objectContaining({
        action: RENEWAL_NOTICE_AUDIT_ACTION,
        org_id: 'org-1',
        metadata: expect.objectContaining({ term: 'sub_1:2026-12-01T00:00:00.000Z', new_price_cents: 99000, recipients: 2 }),
      }),
    ])
    // No address in the claim row.
    expect(JSON.stringify(w.audit)).not.toContain('@')
    expect(s.updates).toHaveLength(0)

    // The next day: same term, already claimed — no second email.
    const again = await runRenewalJob(w.db, d, at('2026-11-02T14:00:00Z'))
    expect(again.noticesSent).toBe(0)
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('a failed claim write sends nothing (and retries tomorrow)', async () => {
    const w = world({ claimInsertError: true })
    const d = deps(fakeStripe({ sub_1: legacySub() }, PRICES))
    const r = await runRenewalJob(w.db, d, at('2026-11-01T14:00:00Z'))
    expect(r).toMatchObject({ noticesSent: 0, failed: 1 })
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('at renewal (within 2 days): switches to the Complete band Price, no proration, once', async () => {
    const w = world({ homes: 48 })
    const s = fakeStripe({ sub_1: legacySub() }, PRICES)
    const d = deps(s)
    await runRenewalJob(w.db, d, at('2026-11-01T14:00:00Z')) // notice
    const early = await runRenewalJob(w.db, d, at('2026-11-25T14:00:00Z'))
    expect(early.switched).toBe(0)

    const r = await runRenewalJob(w.db, d, at('2026-11-30T14:00:00Z'))
    expect(r).toMatchObject({ switched: 1, noticesSent: 0 })
    expect(s.updates).toEqual([
      {
        subscriptionId: 'sub_1',
        itemId: 'si_1',
        priceId: 'price_ca',
        quantity: 48,
        prorationBehavior: 'none',
        idempotencyKey: 'renewal-switch:sub_1:2026-12-01T00:00:00.000Z',
      },
    ])
    expect(w.audit.map((a) => a.action)).toEqual([RENEWAL_NOTICE_AUDIT_ACTION, RENEWAL_SWITCH_AUDIT_ACTION])

    // Re-run: the Price now carries a band lookup key — nothing more happens.
    const again = await runRenewalJob(w.db, d, at('2026-11-30T20:00:00Z'))
    expect(again).toMatchObject({ switched: 0, noticesSent: 0 })
    expect(s.updates).toHaveLength(1)
  })

  it('never switches a term whose notice was not given', async () => {
    const w = world({ members: [], profiles: [] })
    const s = fakeStripe({ sub_1: legacySub() }, PRICES)
    // First run already inside the switch window: the notice is claimed in
    // the same run (0 board recipients), then the switch goes.
    const r = await runRenewalJob(w.db, deps(s), at('2026-11-30T14:00:00Z'))
    expect(r).toMatchObject({ noticesSent: 1, emailsSent: 0, switched: 1 })

    // A claim write that fails blocks the switch too.
    const w2 = world({ claimInsertError: true })
    const s2 = fakeStripe({ sub_1: legacySub() }, PRICES)
    const r2 = await runRenewalJob(w2.db, deps(s2), at('2026-11-30T14:00:00Z'))
    expect(r2.switched).toBe(0)
    expect(s2.updates).toHaveLength(0)
  })

  it('monthly inside the 12-month commitment: no switch at an ordinary monthly invoice', async () => {
    const w = world()
    const sub = legacySub({
      cadence: 'monthly',
      lookupKey: 'hoa_per_door_monthly',
      startedAt: new Date('2026-03-15T00:00:00Z'),
      currentPeriodEnd: new Date('2026-11-15T00:00:00Z'),
    })
    const s = fakeStripe({ sub_1: sub }, PRICES)
    const d = deps(s)
    const r = await runRenewalJob(w.db, d, at('2026-11-14T14:00:00Z'))
    expect(r).toMatchObject({ noticesSent: 0, switched: 0 })
    expect(s.updates).toHaveLength(0)
  })

  it('band Price not configured: logs the lookup key, no change', async () => {
    const w = world()
    const s = fakeStripe({ sub_1: legacySub() }, {})
    const logger = { info: vi.fn(), error: vi.fn() }
    const r = await runRenewalJob(w.db, deps(s), { pricingV2: true, now: Date.parse('2026-11-30T14:00:00Z'), logger })
    expect(r).toMatchObject({ switched: 0, failed: 1 })
    const logged = JSON.stringify([...logger.error.mock.calls, ...logger.info.mock.calls])
    expect(logged).toContain('hoa_complete_annual')
    expect(logged).not.toContain('@')
  })

  it('cancelled or already-moved subscriptions are left alone', async () => {
    for (const over of [{ status: 'canceled' }, { lookupKey: 'hoa_complete_monthly' }]) {
      const w = world()
      const s = fakeStripe({ sub_1: legacySub(over) }, PRICES)
      const d = deps(s)
      const r = await runRenewalJob(w.db, d, at('2026-11-30T14:00:00Z'))
      expect(r).toMatchObject({ noticesSent: 0, switched: 0 })
      expect(d.sendEmail).not.toHaveBeenCalled()
    }
  })
})

describe('buildRenewalNotice', () => {
  it('monthly at 401 homes shows cents', () => {
    const n = buildRenewalNotice({ orgName: 'A & B <HOA>', renewsAt: RENEWS, cadence: 'monthly', homes: 401, link: 'https://x.test/settings/billing' })
    expect(n.subject).toBe('Your plan changes on December 1, 2026: Complete at $349.85 a month')
    expect(n.html).toContain('A &amp; B &lt;HOA&gt;')
    expect(n.html).not.toContain('<HOA>')
  })
})
