import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type Recorded } from './test-utils/fake-supabase'

// A failed read must never look like an empty one. These drive the real
// resident readers with one table at a time answering { data: null, error }.

const h = vi.hoisted(() => ({
  failing: new Set<string>(),
  data: {} as Record<string, unknown>,
  actor: { id: 'u1', email: 'me@x.test', orgId: null as string | null, impersonating: false, client: null as unknown },
}))

vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => h.actor) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => null) }))
vi.mock('@/lib/auth', () => ({}))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { getResidentUnits } from './resident'
import { ResidentUnitsLoadError } from './resident-units-error'
import { getMyTicket } from './resident-tickets'
import { getMyArcRequest, getMyViolationReport } from './resident-submissions'

function respond(q: Recorded) {
  if (h.failing.has(q.table)) return { data: null, error: { code: '42501', message: 'denied' } }
  return { data: h.data[q.table] ?? null, error: null }
}

beforeEach(() => {
  h.failing.clear()
  h.data = {}
  h.actor.id = 'u1'
  h.actor.email = 'me@x.test'
  h.actor.client = fakeSupabase(respond).client
})

const ownership = [
  { unit_id: 'unit-1', ownership_pct: 100, valid_from: '2024-01-01', source: null, unit: { unit_number: '4', address_line1: '1 Oak', association_id: 'a1' } },
]

describe('getResidentUnits', () => {
  it('success: ownerships and association names, unchanged', async () => {
    h.data = { ownerships: ownership, associations: [{ id: 'a1', name: 'Oak HOA', state: 'GA' }] }
    const units = await getResidentUnits()
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({ unit_id: 'unit-1', association_name: 'Oak HOA', association_state: 'GA' })
  })

  it('a genuinely empty home list still returns []', async () => {
    h.actor.email = ''
    expect(await getResidentUnits()).toEqual([])
  })

  it('a failed ownerships read throws, never []', async () => {
    h.failing.add('ownerships')
    await expect(getResidentUnits()).rejects.toBeInstanceOf(ResidentUnitsLoadError)
  })

  it('a failed associations read throws, not units with no community', async () => {
    h.data = { ownerships: ownership }
    h.failing.add('associations')
    await expect(getResidentUnits()).rejects.toBeInstanceOf(ResidentUnitsLoadError)
  })

  it('a failed property_residents read throws on the email fallback', async () => {
    h.failing.add('property_residents')
    await expect(getResidentUnits()).rejects.toBeInstanceOf(ResidentUnitsLoadError)
  })

  it('a failed units read throws on the email fallback', async () => {
    h.data = {
      property_residents: [
        { property_id: 'p1', role: 'owner', moved_in_at: null, property: { id: 'p1', address: '1 Oak', unit_number: '4', org_id: null } },
      ],
    }
    h.failing.add('units')
    await expect(getResidentUnits()).rejects.toBeInstanceOf(ResidentUnitsLoadError)
  })

  it('the error message carries no address or email', async () => {
    h.failing.add('ownerships')
    const e = await getResidentUnits().catch((x: Error) => x)
    expect((e as Error).message).not.toContain('me@x.test')
  })
})

describe('getMyTicket', () => {
  const ticket = { id: 't1', subject: 's', description: 'd', status: 'open', category: 'x', created_at: '2026-01-01', closed_at: null }
  const msgs = [{ id: 'm1', author_role: 'board', body: 'hi', created_at: '2026-01-02', author: { full_name: 'B' } }]

  it('success is unchanged', async () => {
    h.data = { tickets: ticket, ticket_messages: msgs }
    const r = await getMyTicket('t1')
    expect(r).toMatchObject({ ok: true, messagesFailed: false })
    if (r.ok) expect(r.ticket.messages).toEqual([{ id: 'm1', author_role: 'board', author_name: 'B', body: 'hi', created_at: '2026-01-02' }])
  })
  it('a real miss is not_found', async () => {
    expect(await getMyTicket('t1')).toEqual({ ok: false, reason: 'not_found' })
  })
  it('a failed parent read is error, not not_found', async () => {
    h.failing.add('tickets')
    expect(await getMyTicket('t1')).toEqual({ ok: false, reason: 'error' })
  })
  it('a failed messages read keeps the request and flags it', async () => {
    h.data = { tickets: ticket }
    h.failing.add('ticket_messages')
    const r = await getMyTicket('t1')
    expect(r).toMatchObject({ ok: true, messagesFailed: true })
  })
})

describe('getMyArcRequest', () => {
  const arc = { id: 'a1', status: 'submitted' }
  it('success is unchanged', async () => {
    h.data = { arc_requests: arc, arc_request_messages: [{ id: 'm', author_role: 'board', body: 'b', created_at: 'c' }] }
    const r = await getMyArcRequest('a1')
    expect(r).toMatchObject({ ok: true, messagesFailed: false })
    if (r.ok) expect(r.request.messages).toHaveLength(1)
  })
  it('miss, parent failure and message failure are three distinct states', async () => {
    expect(await getMyArcRequest('a1')).toEqual({ ok: false, reason: 'not_found' })
    h.failing.add('arc_requests')
    expect(await getMyArcRequest('a1')).toEqual({ ok: false, reason: 'error' })
    h.failing.clear()
    h.data = { arc_requests: arc }
    h.failing.add('arc_request_messages')
    expect(await getMyArcRequest('a1')).toMatchObject({ ok: true, messagesFailed: true })
  })
})

describe('getMyViolationReport', () => {
  const report = { id: 'r1', status: 'submitted' }
  it('success is unchanged', async () => {
    h.data = { resident_violation_reports: report, resident_violation_report_messages: [{ id: 'm', author_role: 'board', body: 'b', created_at: 'c' }] }
    const r = await getMyViolationReport('r1')
    expect(r).toMatchObject({ ok: true, messagesFailed: false })
    if (r.ok) expect(r.report.messages).toHaveLength(1)
  })
  it('miss, parent failure and message failure are three distinct states', async () => {
    expect(await getMyViolationReport('r1')).toEqual({ ok: false, reason: 'not_found' })
    h.failing.add('resident_violation_reports')
    expect(await getMyViolationReport('r1')).toEqual({ ok: false, reason: 'error' })
    h.failing.clear()
    h.data = { resident_violation_reports: report }
    h.failing.add('resident_violation_report_messages')
    expect(await getMyViolationReport('r1')).toMatchObject({ ok: true, messagesFailed: true })
  })
})
