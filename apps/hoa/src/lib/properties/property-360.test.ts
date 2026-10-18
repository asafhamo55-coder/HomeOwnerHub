import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cappedFakeDb } from '@/lib/supabase/capped-fake-db'
import { loadProperty360 } from './property-360'
import { asPropertyId } from './resolve'

/**
 * BL-074 for the property page: a bounded number of round trips, in a
 * bounded number of sequential WAVES, whatever the home holds.
 *
 * `waved()` wraps the capped fake so no query resolves until the test
 * releases it; each release is one wave — one network round trip of
 * latency. A read added in series (or a per-row lookup) shows up as an
 * extra wave or extra calls here, before it shows up as a slow page.
 */

const ORG = 'org-1'
const P = 'p1'

function fixture(scale: number) {
  const n = (k: number) => Array.from({ length: k * scale }, (_, i) => i)
  return {
    hoa_properties: [
      { id: P, org_id: ORG, deleted_at: null, address: '12 Sample Way, Demo, FL 33000', unit_number: null, owner_name: 'Pat Example', owner_email: 'pat@example.test', owner_phone: null, notes: null, tenure: 'owner_occupied', tenure_updated_at: null, created_at: '2020-01-01T00:00:00Z' },
    ],
    property_residents: n(3).map((i) => ({ id: `r${i}`, property_id: P, deleted_at: null, full_name: `Resident ${i}`, email: null, phone: null, role: 'tenant', is_primary: false, moved_in_at: null, moved_out_at: null, notes: null, created_at: '2026-01-01T00:00:00Z' })),
    property_events: n(5).map((i) => ({ id: `e${i}`, property_id: P, occurred_at: `2026-0${(i % 9) + 1}-01T00:00:00Z`, kind: 'note', payload: {}, notes: 'n', created_by: null })),
    units: [
      { id: 'u1', organization_id: ORG, legacy_hoa_property_id: P, created_at: '2020-01-01T00:00:00Z' },
      { id: 'u1b', organization_id: ORG, legacy_hoa_property_id: P, created_at: '2021-01-01T00:00:00Z' },
    ],
    hoa_property_list_v: [{ id: P, org_id: ORG, balance: 120, days_overdue: 30, open_violations: 1, violations_past_cure: 0, threads_needing_reply: 0 }],
    hoa_violations: n(4).map((i) => ({ id: `v${i}`, property_id: P, deleted_at: null, description: 'x', status: 'open', severity: null, created_at: '2026-09-01T00:00:00Z', cure_period_days: 14, notice_sent_at: null, resolved_at: null })),
    lease_waiting_list: n(2).map((i) => ({ id: `w${i}`, organization_id: ORG, status: 'waiting', property_id: i === 0 ? P : `p${i + 10}`, requested_at: `2026-0${(i % 9) + 1}-01T00:00:00Z` })),
    assessments: n(6).map((i) => ({ id: `a${i}`, unit_id: i % 2 ? 'u1' : 'u1b', deleted_at: null, status: i % 3 ? 'open' : 'paid', due_date: '2026-09-01', amount: 100, assessment_type: 'regular', payments: [] })),
    payments: n(6).map((i) => ({ id: `pm${i}`, unit_id: 'u1', amount: 50, paid_at: '2026-09-02T00:00:00Z', payment_method: 'check' })),
    payment_plans: [],
    collection_cases: [{ id: 'c1', unit_id: 'u1', deleted_at: null, status: 'monitoring', attorney_firm: null, attorney_reference: null, opened_on: '2026-09-10', closed_on: null, closed_reason: null, collection_events: n(3).map((i) => ({ id: `ce${i}`, event_type: 'note', occurred_on: '2026-09-11', note: null, amount: null, actor_initials: null, communication_id: null, created_at: '2026-09-11T00:00:00Z' })) }],
    arc_requests: n(3).map((i) => ({ id: `arc${i}`, unit_id: 'u1', deleted_at: null, summary: 'Fence', category: 'fence', status: 'submitted', submitted_at: '2026-09-01T00:00:00Z', board_response_at: null })),
    inbox_threads: n(3).map((i) => ({ id: `t${i}`, organization_id: ORG, unit_id: 'u1', gmail_state: 'inbox', subject: 's', status: 'open', last_message_at: '2026-10-01T00:00:00Z' })),
    communication_recipients: n(4).map((i) => ({ id: `cr${i}`, unit_id: 'u1', communication_id: 'm1', channel: 'email', delivery_status: 'delivered', queued_at: '2026-10-01T00:00:00Z', sent_at: null, rendered_subject: 'Pool', communications: { subject: 'Pool', category: 'announcement' } })),
    tenancies: [],
    ownerships: [{ id: 'o1', unit_id: 'u1', owner_name: 'Pat Example', owner_email: 'pat@example.test', owner_phone: null, owner_user_id: null, ownership_pct: null, valid_from: '2020-01-01', valid_to: null }],
  }
}

/** The fake, with every query held until released; returns the wave count. */
function waved(db: SupabaseClient) {
  const pending: Array<() => void> = []
  const hold = <T>(p: () => PromiseLike<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => pending.push(() => void p().then(resolve, reject)))
  const wrap = (builder: Record<string, unknown>): unknown =>
    new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            hold(() => ({ then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => (target.then as (a: unknown, b: unknown) => unknown)(a, b) }) as PromiseLike<unknown>).then(res, rej)
        }
        if (prop === 'maybeSingle' || prop === 'single') {
          return () => hold(() => (target[prop] as () => Promise<unknown>)())
        }
        const v = target[prop as string]
        return typeof v === 'function' ? (...args: unknown[]) => (v.apply(target, args), wrap(target)) : v
      },
    })
  const wrapped = { from: (t: string) => wrap((db as unknown as { from: (t: string) => Record<string, unknown> }).from(t)) } as unknown as SupabaseClient
  async function run<T>(work: (db: SupabaseClient) => Promise<T>): Promise<{ result: T; waves: number }> {
    let done = false
    let result!: T
    const p = work(wrapped).then((r) => {
      done = true
      result = r
    })
    let waves = 0
    const settle = () => new Promise((r) => setImmediate(r))
    for (let guard = 0; guard < 50; guard++) {
      await settle()
      await settle()
      if (done) break
      if (pending.length === 0) continue
      waves++
      for (const release of pending.splice(0)) release()
    }
    await p
    return { result, waves }
  }
  return { run }
}

describe('loadProperty360 round trips', () => {
  it('reads in two waves — each read is at most two sequential pages (readAll’s closing empty page)', async () => {
    const fake = cappedFakeDb(fixture(1))
    const { result, waves } = await waved(fake.db).run((db) => loadProperty360(db, { orgId: ORG, propertyId: asPropertyId(P) }))
    expect(result.kind).toBe('ok')
    // 2 logical waves × (1 query + readAll's terminating page).
    expect(waves).toBeLessThanOrEqual(4)
  })

  it('a fixed number of queries whatever the home holds (no per-row lookups)', async () => {
    const small = cappedFakeDb(fixture(1))
    await loadProperty360(small.db, { orgId: ORG, propertyId: asPropertyId(P) })
    const big = cappedFakeDb(fixture(40))
    await loadProperty360(big.db, { orgId: ORG, propertyId: asPropertyId(P) })
    expect(big.calls.length).toBe(small.calls.length)
    expect(small.calls.length).toBeLessThanOrEqual(24)
  })

  it('reads past the 1000-row cap where a section can be long (no truncated counts)', async () => {
    const f = fixture(1)
    f.hoa_violations = Array.from({ length: 1500 }, (_, i) => ({ ...f.hoa_violations[0]!, id: `v${String(i).padStart(5, '0')}` }))
    const fake = cappedFakeDb(f)
    const r = await loadProperty360(fake.db, { orgId: ORG, propertyId: asPropertyId(P) })
    expect(r.kind === 'ok' && r.data.violations.ok && r.data.violations.data.length).toBe(1500)
  })

  it('unit-keyed sections read every bridged unit, not just the canonical one', async () => {
    const fake = cappedFakeDb(fixture(1))
    const r = await loadProperty360(fake.db, { orgId: ORG, propertyId: asPropertyId(P) })
    if (r.kind !== 'ok' || !r.data.openAssessments?.ok) throw new Error('expected open charges')
    expect(r.data.openAssessments.data.map((a) => a.id).sort()).toEqual(['a1', 'a2', 'a4', 'a5'])
    expect(r.data.collections?.ok && r.data.collections.data.openCase?.id).toBe('c1')
    expect(r.data.collections?.ok && r.data.collections.data.events).toHaveLength(3)
  })

  it('one failed section fails only that section', async () => {
    const fake = cappedFakeDb(fixture(1), { failAt: { table: 'arc_requests' } })
    const r = await loadProperty360(fake.db, { orgId: ORG, propertyId: asPropertyId(P) })
    if (r.kind !== 'ok') throw new Error('expected the page to load')
    expect(r.data.arc).toEqual({ ok: false })
    expect(r.data.violations.ok).toBe(true)
    expect(r.data.payments?.ok).toBe(true)
  })

  it('a home with no unit linked: unit-keyed sections are null (nothing to read), not failures', async () => {
    const f = fixture(1)
    f.units = []
    const fake = cappedFakeDb(f)
    const r = await loadProperty360(fake.db, { orgId: ORG, propertyId: asPropertyId(P) })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect([r.data.arc, r.data.threads, r.data.payments, r.data.ownerships]).toEqual([null, null, null, null])
    // …and wave 2 never runs.
    expect(fake.calls.some((c) => c.table === 'assessments')).toBe(false)
  })

  it('a failed unit read fails the unit-keyed sections instead of calling them "not linked"', async () => {
    const fake = cappedFakeDb(fixture(1), { failAt: { table: 'units' } })
    const r = await loadProperty360(fake.db, { orgId: ORG, propertyId: asPropertyId(P) })
    if (r.kind !== 'ok') throw new Error('expected ok')
    expect(r.data.unit.ok).toBe(false)
    expect(r.data.arc).toEqual({ ok: false })
    expect(r.data.threads).toEqual({ ok: false })
  })

  it('an unknown home is not_found; a failed home read is failed (not a 404)', async () => {
    const f = fixture(1)
    f.hoa_properties = []
    expect((await loadProperty360(cappedFakeDb(f).db, { orgId: ORG, propertyId: asPropertyId(P) })).kind).toBe('not_found')
    const failing = cappedFakeDb(fixture(1), { failAt: { table: 'hoa_properties' } })
    expect((await loadProperty360(failing.db, { orgId: ORG, propertyId: asPropertyId(P) })).kind).toBe('failed')
  })
})
