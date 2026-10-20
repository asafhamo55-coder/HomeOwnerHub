import { describe, expect, it, vi } from 'vitest'
import { PRICING_V2 } from '@homeowner-portal/billing'
import { BAND_SYNC_AUDIT_ACTION, planForBandLookupKey, runBandSync } from './billing-band-sync'
import type { SubscriptionSnapshot } from './billing-stripe-port'
import { fakeDb, fakeStripe, filterValue, silentLogger, type FakeQuery } from './billing-fake.test-util'

// BL-104 nightly band sync. Stripe is a fake port; the db is an in-memory
// query fake. Nothing here can reach Stripe or a database.

const NOW = Date.parse('2026-11-02T06:00:00.000Z')

function sub(id: string, quantity: number, over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id,
    status: 'active',
    startedAt: new Date('2026-06-01T00:00:00Z'),
    currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
    cadence: 'monthly',
    itemId: `si_${id}`,
    quantity,
    lookupKey: 'hoa_essentials_monthly',
    ...over,
  }
}

function world(orgs: Array<{ id: string; plan: string; sub: string; homes: number | 'error' }>) {
  const audit: Record<string, unknown>[] = []
  const f = fakeDb((q: FakeQuery) => {
    if (q.table === 'orgs') return { data: orgs.map((o) => ({ id: o.id, plan: o.plan, stripe_sub_id: o.sub })), error: null }
    if (q.table === 'hoa_properties') {
      const o = orgs.find((x) => x.id === filterValue(q, 'eq', 'org_id'))!
      return o.homes === 'error' ? { count: null, error: { code: '57014' } } : { count: o.homes, error: null }
    }
    if (q.table === 'audit_log' && q.op === 'insert') {
      audit.push(q.row!)
      return { error: null }
    }
    throw new Error(`unexpected ${q.table}`)
  })
  return { ...f, audit }
}

describe('runBandSync', () => {
  it('ships off: with PRICING_V2 off it is a no-op — no read, no Stripe', async () => {
    expect(PRICING_V2).toBe(false)
    const f = world([{ id: 'org-1', plan: 'essentials', sub: 'sub_1', homes: 60 }])
    const stripe = vi.fn(() => fakeStripe({ sub_1: sub('sub_1', 48) }).port)
    const r = await runBandSync(f.db, { stripe }, { now: NOW, logger: silentLogger() })
    expect(r).toMatchObject({ skipped: 'pricing_v2_off', checked: 0, changed: 0 })
    expect(f.queries).toHaveLength(0)
    expect(stripe).not.toHaveBeenCalled()
  })

  it('skips when Stripe is not configured', async () => {
    const f = world([])
    const r = await runBandSync(f.db, { stripe: () => null }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(r.skipped).toBe('stripe_not_configured')
    expect(f.queries).toHaveLength(0)
  })

  it('reads only new-plan orgs with a subscription', async () => {
    const f = world([])
    await runBandSync(f.db, { stripe: () => fakeStripe({}).port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    const q = f.queries.find((x) => x.table === 'orgs')!
    expect(filterValue(q, 'in', 'plan')).toEqual(['essentials', 'complete'])
    expect(filterValue(q, 'not', 'stripe_sub_id')).toEqual(['is', null])
  })

  it('band changed (48 → 60 homes): quantity set with no proration, effective next renewal; idempotent on re-run', async () => {
    const f = world([{ id: 'org-1', plan: 'essentials', sub: 'sub_1', homes: 60 }])
    const s = fakeStripe({ sub_1: sub('sub_1', 48) })
    const r = await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(r).toMatchObject({ checked: 1, changed: 1, failed: 0 })
    expect(s.updates).toEqual([
      {
        subscriptionId: 'sub_1',
        itemId: 'si_sub_1',
        quantity: 60,
        prorationBehavior: 'none',
        idempotencyKey: 'band-sync:sub_1:60:2026-11-02',
      },
    ])
    expect(s.updates[0]).not.toHaveProperty('priceId')
    expect(f.audit).toEqual([
      expect.objectContaining({
        action: BAND_SYNC_AUDIT_ACTION,
        org_id: 'org-1',
        metadata: expect.objectContaining({ from_quantity: 48, to_quantity: 60, from_band: '1-50', to_band: '51-100', effective: 'next_renewal' }),
      }),
    ])

    const again = await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(again).toMatchObject({ changed: 0, unchanged: 1 })
    expect(s.updates).toHaveLength(1)
    expect(f.audit).toHaveLength(1)
  })

  it('a count that moves inside a band changes nothing', async () => {
    const f = world([{ id: 'org-1', plan: 'complete', sub: 'sub_1', homes: 45 }])
    const s = fakeStripe({ sub_1: sub('sub_1', 40, { lookupKey: 'hoa_complete_annual', cadence: 'annual' }) })
    const r = await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(r).toMatchObject({ changed: 0, unchanged: 1 })
    expect(s.updates).toHaveLength(0)
  })

  it('401+ is per door: any change in count is synced', async () => {
    const f = world([{ id: 'org-1', plan: 'complete', sub: 'sub_1', homes: 460 }])
    const s = fakeStripe({ sub_1: sub('sub_1', 450, { lookupKey: 'hoa_complete_monthly' }) })
    await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(s.updates.map((u) => u.quantity)).toEqual([460])
  })

  it('band went down (120 → 90): synced the same way, no credit', async () => {
    const f = world([{ id: 'org-1', plan: 'essentials', sub: 'sub_1', homes: 90 }])
    const s = fakeStripe({ sub_1: sub('sub_1', 120) })
    await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(s.updates).toEqual([expect.objectContaining({ quantity: 90, prorationBehavior: 'none' })])
  })

  it('leaves alone: 0 homes, a legacy Price, a cancelled subscription, a missing one', async () => {
    const f = world([
      { id: 'org-0', plan: 'essentials', sub: 'sub_0', homes: 0 },
      { id: 'org-1', plan: 'essentials', sub: 'sub_1', homes: 70 },
      { id: 'org-2', plan: 'complete', sub: 'sub_2', homes: 70 },
      { id: 'org-3', plan: 'complete', sub: 'sub_3', homes: 70 },
    ])
    const s = fakeStripe({
      sub_0: sub('sub_0', 30),
      sub_1: sub('sub_1', 30, { lookupKey: 'hoa_per_door_monthly' }),
      sub_2: sub('sub_2', 30, { status: 'canceled', lookupKey: 'hoa_complete_monthly' }),
      sub_3: null,
    })
    const r = await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger: silentLogger() })
    expect(r).toMatchObject({ checked: 4, changed: 0, ignored: 4, failed: 0 })
    expect(s.updates).toHaveLength(0)
  })

  it('one org failing (count read, Stripe error) does not stop the rest; logs ids and codes only', async () => {
    const f = world([
      { id: 'org-1', plan: 'essentials', sub: 'sub_1', homes: 'error' },
      { id: 'org-2', plan: 'essentials', sub: 'sub_2', homes: 60 },
      { id: 'org-3', plan: 'essentials', sub: 'sub_3', homes: 60 },
    ])
    const s = fakeStripe({ sub_2: sub('sub_2', 10), sub_3: sub('sub_3', 10) })
    const real = s.port.updateSubscriptionItem
    s.port.updateSubscriptionItem = async (c) => {
      if (c.subscriptionId === 'sub_2') {
        throw Object.assign(new Error('No such customer: jane@example.com'), { type: 'StripeInvalidRequestError', code: 'resource_missing' })
      }
      return real(c)
    }
    const logger = { info: vi.fn(), error: vi.fn() }
    const r = await runBandSync(f.db, { stripe: () => s.port }, { pricingV2: true, now: NOW, logger })
    expect(r).toMatchObject({ checked: 3, changed: 1, failed: 2 })
    const logged = JSON.stringify([...logger.error.mock.calls, ...logger.info.mock.calls])
    expect(logged).toContain('resource_missing')
    expect(logged).toContain('57014')
    expect(logged).not.toContain('@')
  })

  it('an org read error throws (Inngest retries)', async () => {
    const f = fakeDb(() => ({ data: null, error: { code: '08006' } }))
    await expect(
      runBandSync(f.db, { stripe: () => fakeStripe({}).port }, { pricingV2: true, now: NOW, logger: silentLogger() }),
    ).rejects.toThrow('org_read_failed')
  })

  it('maps only band lookup keys to a plan', () => {
    expect(planForBandLookupKey('hoa_essentials_annual')).toBe('essentials')
    expect(planForBandLookupKey('hoa_complete_monthly')).toBe('complete')
    expect(planForBandLookupKey('hoa_per_door_monthly')).toBeNull()
    expect(planForBandLookupKey(null)).toBeNull()
  })
})
