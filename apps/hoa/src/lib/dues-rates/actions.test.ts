import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// BL-137 (migration 0069, M5_APPLIED). Flag off: the actions, the loader
// and the override audit never touch the database. Flag on: role first,
// then validation, then one write through the board's own client, with
// one audit_log row (ids and amounts only).

const h = vi.hoisted(() => ({
  m5: false,
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: boolean; role?: string; orgId?: string; error?: string },
  client: null as unknown,
}))

vi.mock('@homeowner-portal/db/m5', () => ({
  get M5_APPLIED() {
    return h.m5
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Oak', timeZone: 'America/New_York' }) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.client }))

import { deleteDuesRate, saveDuesRate } from './actions'
import { recordDuesRateOverride, RATE_OVERRIDE_ACTION } from './billing'
import { DUES_RATES_NOT_LIVE } from './model'
import { loadDuesRates } from './queries'

const RATE_ID = '33333333-3333-4333-8333-333333333333'
const good = { effectiveFrom: '2027-01-01', amount: '275', frequency: 'monthly' }

function mem(seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const m = memorySupabase(seed)
  const client = m.client as unknown as Record<string, unknown>
  client.auth = { getUser: async () => ({ data: { user: { id: 'user-1' } } }) }
  h.client = client
  return m
}

beforeEach(() => {
  h.m5 = false
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.client = null
})

describe('flag off (M5_APPLIED false): a no-op that never touches the database', () => {
  it('save and delete refuse with the not-live message', async () => {
    const m = mem()
    expect(await saveDuesRate(good)).toEqual({ ok: false, error: DUES_RATES_NOT_LIVE })
    expect(await deleteDuesRate(RATE_ID)).toEqual({ ok: false, error: DUES_RATES_NOT_LIVE })
    expect(m.calls).toEqual([])
  })

  it('the loader returns [] and the override audit is off, without a query', async () => {
    const m = mem()
    expect(await loadDuesRates(m.client as never, 'assoc-1')).toEqual([])
    expect(
      await recordDuesRateOverride(m.client as never, {
        orgId: 'org-1',
        associationId: 'assoc-1',
        day: '2026-10-21',
        cadence: 'monthly',
        billedCents: 30_000,
        scope: 'all',
        created: 3,
      }),
    ).toBe('off')
    expect(m.calls).toEqual([])
  })
})

describe('flag on', () => {
  beforeEach(() => {
    h.m5 = true
  })

  it('a resident (or anyone not board/admin) is refused before anything else', async () => {
    const m = mem()
    h.gate = { ok: false, error: 'denied' }
    expect(await saveDuesRate(good)).toEqual({ ok: false, error: 'denied' })
    expect(await deleteDuesRate(RATE_ID)).toEqual({ ok: false, error: 'denied' })
    expect(m.calls).toEqual([])
  })

  it('validation errors come back per field, with no write', async () => {
    const m = mem()
    const r = await saveDuesRate({ effectiveFrom: 'soon', amount: '-1', frequency: 'weekly' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(['amount', 'effectiveFrom', 'frequency'])
    expect(m.calls).toEqual([])
  })

  it('save writes one per-home rate for the primary association and one audit row', async () => {
    const m = mem()
    const r = await saveDuesRate({ ...good, notes: 'Adopted Nov 12' })
    expect(r.ok).toBe(true)
    expect(m.rows('dues_rates')).toEqual([
      expect.objectContaining({
        organization_id: 'org-1',
        association_id: 'assoc-1',
        effective_from: '2027-01-01',
        basis: 'per_home',
        amount_cents: 27_500,
        frequency: 'monthly',
        notes: 'Adopted Nov 12',
      }),
    ])
    const audit = m.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: 'dues_rate.created', entity_type: 'dues_rate', user_id: 'user-1' })
    expect(JSON.stringify(audit[0]!.metadata)).not.toContain('Adopted')
  })

  it('a rate that has started cannot be removed; an upcoming one can', async () => {
    const m = mem({
      dues_rates: [
        { id: RATE_ID, association_id: 'assoc-1', effective_from: '2020-01-01' },
        { id: '44444444-4444-4444-8444-444444444444', association_id: 'assoc-1', effective_from: '2999-01-01' },
      ],
    })
    const started = await deleteDuesRate(RATE_ID)
    expect(started.ok).toBe(false)
    expect(await deleteDuesRate('44444444-4444-4444-8444-444444444444')).toEqual({ ok: true })
    expect(m.rows('dues_rates').map((r) => r.id)).toEqual([RATE_ID])
    expect(m.rows('audit_log')).toHaveLength(1)
  })

  it('another association’s rate is not found', async () => {
    mem({ dues_rates: [{ id: RATE_ID, association_id: 'assoc-2', effective_from: '2999-01-01' }] })
    expect(await deleteDuesRate(RATE_ID)).toEqual({ ok: false, error: 'That rate isn’t part of your association.' })
  })

  it('override audit: billed at the rate → nothing; billed differently → one row with ids and cents only', async () => {
    const m = mem({
      dues_rates: [{ id: RATE_ID, association_id: 'assoc-1', effective_from: '2026-01-01', amount_cents: 25_000, frequency: 'monthly', basis: 'per_home' }],
    })
    const base = { orgId: 'org-1', associationId: 'assoc-1', day: '2026-10-21', cadence: 'monthly' as const, scope: 'all' as const, created: 40 }
    expect(await recordDuesRateOverride(m.client as never, { ...base, billedCents: 25_000 })).toBe('none')
    expect(m.rows('audit_log')).toHaveLength(0)
    expect(await recordDuesRateOverride(m.client as never, { ...base, billedCents: 26_000 })).toBe('logged')
    expect(m.rows('audit_log')).toEqual([
      expect.objectContaining({
        action: RATE_OVERRIDE_ACTION,
        entity_id: RATE_ID,
        user_id: 'user-1',
        metadata: { association_id: 'assoc-1', expected_cents: 25_000, billed_cents: 26_000, cadence: 'monthly', scope: 'all', charges: 40 },
      }),
    ])
    expect(await recordDuesRateOverride(m.client as never, { ...base, billedCents: 26_000, created: 0 })).toBe('none')
  })
})
