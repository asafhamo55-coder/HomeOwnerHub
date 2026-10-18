import { describe, expect, it } from 'vitest'
import {
  agingBucketFor,
  agingBuckets,
  buildPeople,
  buildTimeline,
  currentLease,
  needsAction,
  waitingPosition,
  type ArcRow,
  type OwnershipRow,
  type TenancyRow,
  type ThreadRow,
  type ViolationRow,
} from './property-360-model'
import type { PropertyResidentRow } from '@/lib/property-residents'
import type { PropertyEventRow } from '@/lib/property-events'

const TODAY = '2026-10-17'
const NOW = new Date('2026-10-17T12:00:00Z')

describe('agingBuckets', () => {
  it('buckets what is still owed by how late it is, and names the oldest', () => {
    const a = agingBuckets(
      [
        { id: '1', due_date: '2026-10-25', amount: 100, status: 'open', assessment_type: 'regular', payments: [] },
        { id: '2', due_date: '2026-10-01', amount: 100, status: 'partial', assessment_type: 'regular', payments: [{ amount: 40 }] },
        { id: '3', due_date: '2026-07-01', amount: '250.50', status: 'open', assessment_type: 'special', payments: null },
        { id: '4', due_date: '2026-08-01', amount: 100, status: 'partial', assessment_type: 'regular', payments: [{ amount: 100 }] },
      ],
      TODAY,
    )
    expect(a.total).toBe(410.5)
    expect(a.buckets).toEqual({ current: 100, '1-30': 60, '31-60': 0, '61-90': 0, '90+': 250.5 })
    expect(a.oldest).toBe('90+')
  })

  it('nothing owed → zero and no oldest bucket', () => {
    expect(agingBuckets([], TODAY)).toMatchObject({ total: 0, oldest: null })
  })

  it('bucket edges', () => {
    expect(agingBucketFor(0)).toBe('current')
    expect(agingBucketFor(30)).toBe('1-30')
    expect(agingBucketFor(31)).toBe('31-60')
    expect(agingBucketFor(90)).toBe('61-90')
    expect(agingBucketFor(91)).toBe('90+')
  })
})

const own = (over: Partial<OwnershipRow>): OwnershipRow => ({
  id: 'o1',
  owner_name: 'Pat Example',
  owner_email: 'pat@example.test',
  owner_phone: null,
  owner_user_id: null,
  ownership_pct: null,
  valid_from: '2020-01-01',
  valid_to: null,
  ...over,
})
const resident = (over: Partial<PropertyResidentRow>): PropertyResidentRow => ({
  id: 'r1',
  property_id: 'p1',
  full_name: 'Sam Resident',
  email: null,
  phone: null,
  role: 'tenant',
  is_primary: false,
  moved_in_at: null,
  moved_out_at: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})
const tenancy = (over: Partial<TenancyRow>): TenancyRow => ({
  id: 't1',
  tenant_name: 'Lee Lessee',
  tenant_email: 'lee@example.test',
  tenant_phone: null,
  tenant_user_id: null,
  lease_start: '2026-01-01',
  lease_end: '2026-12-31',
  status: 'active',
  ...over,
})
const property = { owner_name: 'Robin Co-Owner', owner_email: 'robin@example.test', owner_phone: null }

describe('buildPeople', () => {
  it('owners come from the lot record; the one the home names is primary and listed first', () => {
    const p = buildPeople({
      property,
      ownerships: [own({ id: 'o1' }), own({ id: 'o2', owner_name: 'Robin Co-Owner', owner_email: 'robin@example.test', owner_user_id: 'user-1' })],
      tenancies: [],
      residents: [],
      today: TODAY,
    })
    expect(p.owners.map((o) => [o.key, o.primary, o.portal])).toEqual([
      ['o2', true, true],
      ['o1', false, false],
    ])
  })

  it('a sold ownership is a previous owner, not a current one', () => {
    const p = buildPeople({
      property,
      ownerships: [own({ id: 'old', valid_to: '2025-06-30' }), own({ id: 'new', owner_name: 'Robin Co-Owner', valid_from: '2025-07-01' })],
      tenancies: [],
      residents: [],
      today: TODAY,
    })
    expect(p.owners.map((o) => o.key)).toEqual(['new'])
    expect(p.previousOwners.map((o) => o.key)).toEqual(['old'])
  })

  it('with no ownership rows the home’s owner fields stand in, portal unknown', () => {
    const p = buildPeople({ property, ownerships: [], tenancies: [], residents: [], today: TODAY })
    expect(p.owners).toEqual([expect.objectContaining({ source: 'property', primary: true, portal: null, name: 'Robin Co-Owner' })])
  })

  it('no owner anywhere → no owners (the page says so)', () => {
    const p = buildPeople({ property: { owner_name: null, owner_email: null, owner_phone: null }, ownerships: [], tenancies: [], residents: [], today: TODAY })
    expect(p.owners).toEqual([])
  })

  it('splits residents from moved-out, and adds lease tenants not already listed', () => {
    const p = buildPeople({
      property,
      ownerships: [],
      tenancies: [tenancy({}), tenancy({ id: 't2', tenant_name: 'Sam Resident', tenant_email: null }), tenancy({ id: 't3', status: 'ended' })],
      residents: [resident({}), resident({ id: 'r2', moved_out_at: '2026-01-01' })],
      today: TODAY,
    })
    expect(p.residents.map((r) => r.id)).toEqual(['r1'])
    expect(p.movedOut.map((r) => r.id)).toEqual(['r2'])
    expect(p.leaseTenants.map((t) => t.key)).toEqual(['t1'])
  })
})

describe('currentLease / waitingPosition', () => {
  it('the active lease covering today, else the latest', () => {
    expect(currentLease([tenancy({})], TODAY)).toMatchObject({ current: true })
    expect(currentLease([tenancy({ status: 'ended', lease_end: '2025-12-31', lease_start: '2025-01-01' })], TODAY)).toMatchObject({ current: false })
    expect(currentLease([], TODAY)).toBeNull()
  })

  it('position in the queue is by request time', () => {
    const queue = [
      { id: 'w2', property_id: 'p2', requested_at: '2026-02-01T00:00:00Z' },
      { id: 'w1', property_id: 'p1', requested_at: '2026-03-01T00:00:00Z' },
      { id: 'w3', property_id: 'p3', requested_at: '2026-01-01T00:00:00Z' },
    ]
    expect(waitingPosition(queue, 'p1')).toEqual({ position: 3, of: 3, requestedAt: '2026-03-01T00:00:00Z' })
    expect(waitingPosition(queue, 'p9')).toBeNull()
  })
})

const violation = (over: Partial<ViolationRow>): ViolationRow => ({
  id: 'v1',
  description: 'Trash cans visible',
  severity: 'minor',
  status: 'notice_sent',
  created_at: '2026-09-01T00:00:00Z',
  notice_sent_at: '2026-09-01T00:00:00Z',
  cure_period_days: 14,
  ...over,
})
const hrefs = { violations: '/violations?property=p1', dues: '/dues?property=p1', compliance: '#compliance', communications: '#communications' }
const quiet = {
  propertyId: 'p1',
  now: NOW,
  violations: { ok: true as const, data: [] },
  stats: { ok: true as const, data: { balance: 0, daysOverdue: 0, threadsNeedingReply: 0 } },
  aging: { ok: true as const, data: agingBuckets([], TODAY) },
  collectionCase: { ok: true as const, data: null },
  arc: { ok: true as const, data: [] as ArcRow[] },
  threads: { ok: true as const, data: [] as ThreadRow[] },
  hrefs,
}

describe('needsAction', () => {
  it('is empty for a quiet home (the strip is not rendered)', () => {
    expect(needsAction(quiet)).toEqual([])
  })

  it('one past-cure violation links straight to it; several link to the scoped list', () => {
    expect(needsAction({ ...quiet, violations: { ok: true, data: [violation({})] } })[0]).toMatchObject({
      key: 'violations',
      tone: 'danger',
      title: '1 violation past the cure date',
      href: '/violations/v1',
    })
    expect(needsAction({ ...quiet, violations: { ok: true, data: [violation({}), violation({ id: 'v2' })] } })[0]?.href).toBe(
      '/violations?property=p1',
    )
  })

  it('a violation still inside its cure period is not "needs action"', () => {
    expect(needsAction({ ...quiet, violations: { ok: true, data: [violation({ notice_sent_at: '2026-10-15T00:00:00Z' })] } })).toEqual([])
  })

  it('an overdue balance names the aging bucket and the collections stage, and links to dues', () => {
    const aging = agingBuckets([{ id: 'a', due_date: '2026-08-01', amount: 300, status: 'open', assessment_type: 'regular', payments: [] }], TODAY)
    const item = needsAction({
      ...quiet,
      stats: { ok: true, data: { balance: 300, daysOverdue: 77, threadsNeedingReply: 0 } },
      aging: { ok: true, data: aging },
      collectionCase: { ok: true, data: { id: 'c1', status: 'collection_letter', opened_on: '2026-09-01', closed_on: null } },
    })[0]
    expect(item).toMatchObject({ key: 'balance', title: '$300.00 overdue', href: '/dues?property=p1' })
    expect(item?.detail).toBe('Oldest charge 61–90 days late · Collections: Collection letter sent')
  })

  it('ARC awaiting a decision and mail awaiting a reply', () => {
    const items = needsAction({
      ...quiet,
      arc: { ok: true, data: [{ id: 'a1', summary: 'New fence', category: 'fence', status: 'submitted', submitted_at: '2026-10-01T00:00:00Z', board_response_at: null }] },
      threads: { ok: true, data: [{ id: 't1', subject: 'Gate code', status: 'needs_review', lastMessageAt: '2026-10-16T00:00:00Z' }] },
    })
    expect(items.map((i) => [i.key, i.href])).toEqual([
      ['arc', '/arc/a1'],
      ['mail', '/inbox/t1'],
    ])
  })

  it('a failed source says it could not be checked — never silently "nothing to do"', () => {
    const items = needsAction({ ...quiet, violations: { ok: false }, stats: { ok: false }, arc: { ok: false }, threads: { ok: false } })
    expect(items.map((i) => [i.key, i.tone])).toEqual([
      ['violations', 'neutral'],
      ['balance', 'neutral'],
      ['arc', 'neutral'],
      ['mail', 'neutral'],
    ])
    expect(items[0]?.title).toBe('Couldn’t check violations')
  })

  it('no unit linked → ARC and mail are not checked at all (null), not reported as failures', () => {
    expect(needsAction({ ...quiet, arc: null, threads: null, aging: null, collectionCase: null })).toEqual([])
  })
})

describe('buildTimeline', () => {
  const event = (over: Partial<PropertyEventRow>): PropertyEventRow => ({
    id: 'e1',
    property_id: 'p1',
    occurred_at: '2026-10-10T00:00:00Z',
    kind: 'note',
    payload: {},
    notes: 'Called about the gate',
    created_by: null,
    ...over,
  })

  it('merges every source newest first, each linking to its record', () => {
    const items = buildTimeline({
      events: [event({}), event({ id: 'e2', kind: 'tenure_changed', payload: { from: 'owner_occupied', to: 'leased' }, notes: null, occurred_at: '2026-01-01T00:00:00Z' })],
      violations: [violation({ status: 'resolved', resolved_at: '2026-09-20T00:00:00Z' })],
      arc: [{ id: 'a1', summary: 'Fence', category: 'fence', status: 'approved', submitted_at: '2026-08-01T00:00:00Z', board_response_at: '2026-08-05T00:00:00Z' }],
      payments: [{ id: 'pm1', amount: 120, paid_at: '2026-10-12T00:00:00Z', payment_method: 'check' }],
      threads: [{ id: 't1', subject: 'Gate', status: 'closed', lastMessageAt: '2026-10-11T00:00:00Z' }],
      notices: [{ id: 'n1', communicationId: 'c1', subject: 'Pool closing', category: 'announcement', channel: 'email', deliveryStatus: 'delivered', at: '2026-10-13T00:00:00Z' }],
      tenureLabels: { owner_occupied: 'Owner-occupied', leased: 'Leased' },
    })
    expect(items.map((i) => i.title)).toEqual([
      'Notice sent: Pool closing',
      'Payment received: $120.00 (check)',
      'Email: Gate',
      'Note',
      'Violation closed: Trash cans visible',
      // Same instant: ties break by id, so the order is stable between loads.
      'Violation notice sent: Trash cans visible',
      'Violation reported: Trash cans visible',
      'ARC request approved: Fence',
      'ARC request submitted: Fence',
      'Tenure changed from Owner-occupied to Leased',
    ])
    expect(items.find((i) => i.kind === 'note')?.body).toBe('Called about the gate')
    expect(items.find((i) => i.kind === 'notice')?.href).toBe('/communications/c1')
  })

  it('caps the timeline', () => {
    const events = Array.from({ length: 60 }, (_, i) => event({ id: `e${i}`, occurred_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString() }))
    expect(buildTimeline({ events, tenureLabels: {} }, 40)).toHaveLength(40)
  })
})
