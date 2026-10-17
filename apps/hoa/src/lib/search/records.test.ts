import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEARCH_LIMIT_PER_TYPE,
  SEARCH_MIN_LENGTH,
  searchRecords,
  searchTerm,
  type SearchClient,
} from './records'

// A chainable PostgREST stand-in. Every call on a builder is recorded so the
// tests can assert org scoping, soft-delete filters, the or() shape and the
// per-type cap; each table resolves to whatever `rows` / `errors` hold.

interface Call {
  table: string
  ops: Array<[string, ...unknown[]]>
}

const ORG = 'org-1'
const TZ = 'America/New_York'
const NOW = new Date('2026-10-17T16:00:00Z')
const OPTS = { timeZone: TZ, now: NOW }

let calls: Call[]
let rows: Record<string, unknown[]>
let errors: Record<string, { code: string; message: string } | undefined>

function client(): SearchClient {
  return {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'is', 'or', 'in', 'order', 'limit']) {
        b[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args])
          return b
        }
      }
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(
          errors[table] ? { data: null, error: errors[table] } : { data: rows[table] ?? [], error: null },
        ).then(resolve, reject)
      return b as never
    },
  }
}

function opsFor(table: string): Array<[string, ...unknown[]]> {
  const c = calls.find((x) => x.table === table)
  if (!c) throw new Error(`no query against ${table}`)
  return c.ops
}

function orFilter(table: string): string {
  const op = opsFor(table).find((o) => o[0] === 'or')
  return String(op?.[1] ?? '')
}

const P1 = { id: 'p1', address: '12 Kaur Lane', unit_number: null, owner_name: 'Jane Doe', unit_id: 'u1' }
const P2 = { id: 'p2', address: '9 Elm St', unit_number: '4B', owner_name: 'Amrit Kaur', unit_id: 'u2' }

beforeEach(() => {
  calls = []
  rows = {}
  errors = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('searchTerm', () => {
  it('refuses a query shorter than the minimum', () => {
    expect(SEARCH_MIN_LENGTH).toBe(2)
    expect(searchTerm('')).toBeNull()
    expect(searchTerm('  k  ')).toBeNull()
    expect(searchTerm('ka')).toBe('ka')
  })

  it('escapes LIKE wildcards and strips PostgREST or() separators', () => {
    expect(searchTerm('50%_off')).toBe('50\\%\\_off')
    expect(searchTerm('a,b(c)')).toBe('a b c')
  })

  it('strips the * wildcard alias and quotes', () => {
    expect(searchTerm('ka*ur"')).toBe('ka ur')
  })
})

describe('searchRecords', () => {
  it('does not touch the database for a too-short query', async () => {
    const res = await searchRecords(client(), ORG, 'k')
    expect(res).toEqual({ groups: [], failed: [] })
    expect(calls).toHaveLength(0)
  })

  it('scopes every query to the caller org', async () => {
    await searchRecords(client(), ORG, 'kaur')
    const expected: Record<string, string> = {
      hoa_property_list_v: 'org_id',
      hoa_violations: 'org_id',
      arc_requests: 'organization_id',
      tickets: 'organization_id',
      inbox_threads: 'organization_id',
      vendors: 'organization_id',
      hoa_documents: 'org_id',
      governing_documents: 'organization_id',
      hoa_meeting_minutes: 'org_id',
    }
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(Object.keys(expected)))
    for (const [table, col] of Object.entries(expected)) {
      expect(opsFor(table), table).toContainEqual(['eq', col, ORG])
    }
  })

  it('caps every type at the per-type limit', async () => {
    rows.hoa_violations = Array.from({ length: 9 }, (_, i) => ({
      id: `v${i}`,
      violation_type: 'Trash bins',
      status: 'open',
      property_id: null,
    }))
    const res = await searchRecords(client(), ORG, 'trash')
    for (const c of calls.filter((x) => x.table !== 'hoa_property_list_v')) {
      expect(c.ops, c.table).toContainEqual(['limit', SEARCH_LIMIT_PER_TYPE])
    }
    const v = res.groups.find((g) => g.type === 'violation')
    expect(v?.items).toHaveLength(SEARCH_LIMIT_PER_TYPE)
  })

  it('excludes soft-deleted violations, ARC requests, tickets, vendors and meetings', async () => {
    await searchRecords(client(), ORG, 'kaur')
    for (const t of ['hoa_violations', 'arc_requests', 'tickets', 'vendors', 'hoa_meeting_minutes']) {
      expect(opsFor(t), t).toContainEqual(['is', 'deleted_at', null])
    }
  })

  it('excludes superseded governing documents (they have no deleted_at)', async () => {
    await searchRecords(client(), ORG, 'kaur')
    expect(opsFor('governing_documents')).toContainEqual(['is', 'superseded_at', null])
  })

  it('puts an owner-name match under Owners and an address match under Properties', async () => {
    rows.hoa_property_list_v = [P1, P2]
    const res = await searchRecords(client(), ORG, 'Kaur')
    const owners = res.groups.find((g) => g.type === 'owner')
    const props = res.groups.find((g) => g.type === 'property')
    expect(owners?.items).toEqual([
      { id: 'p2', type: 'owner', label: 'Amrit Kaur', hint: '9 Elm St · Unit 4B', detail: null, href: '/properties/p2' },
    ])
    expect(props?.items).toEqual([
      { id: 'p1', type: 'property', label: '12 Kaur Lane', hint: 'Jane Doe', detail: null, href: '/properties/p1' },
    ])
    expect(orFilter('hoa_property_list_v')).toBe(
      'address.ilike.%Kaur%,unit_number.ilike.%Kaur%,owner_name.ilike.%Kaur%',
    )
  })

  it('finds violations, ARC, tickets and threads linked to a matched property', async () => {
    rows.hoa_property_list_v = [P1, P2]
    rows.hoa_violations = [
      { id: 'v1', violation_type: 'parking', status: 'open', property_id: 'p2', created_at: '2026-10-03T14:00:00Z' },
    ]
    rows.arc_requests = [
      { id: 'a1', summary: 'New fence', status: 'submitted', unit_id: 'u2', submitted_at: '2026-09-30T14:00:00Z' },
    ]
    rows.tickets = [{ id: 't1', subject: 'Gate broken', status: 'open', unit_id: 'u2', created_at: '2026-10-01T14:00:00Z' }]
    rows.inbox_threads = [
      { id: 'th1', subject: null, status: 'open', unit_id: 'u2', last_message_at: '2026-10-02T14:00:00Z' },
    ]
    const res = await searchRecords(client(), ORG, 'Kaur', OPTS)

    expect(orFilter('hoa_violations')).toBe(
      'violation_type.ilike.%Kaur%,description.ilike.%Kaur%,property_id.in.(p1,p2)',
    )
    expect(orFilter('arc_requests')).toBe('summary.ilike.%Kaur%,contractor_name.ilike.%Kaur%,unit_id.in.(u1,u2)')
    expect(orFilter('tickets')).toBe('subject.ilike.%Kaur%,unit_id.in.(u1,u2)')
    expect(orFilter('inbox_threads')).toBe('subject.ilike.%Kaur%,unit_id.in.(u1,u2)')

    const byType = Object.fromEntries(res.groups.map((g) => [g.type, g.items]))
    expect(byType.violation).toEqual([
      {
        id: 'v1',
        type: 'violation',
        label: 'parking',
        hint: '9 Elm St · Unit 4B',
        detail: 'Open · Oct 3',
        href: '/violations/v1',
      },
    ])
    expect(byType.arc[0]).toMatchObject({
      label: 'New fence',
      hint: '9 Elm St · Unit 4B',
      detail: 'Submitted · Sep 30',
      href: '/arc/a1',
    })
    expect(byType.ticket[0]).toMatchObject({
      label: 'Gate broken',
      hint: '9 Elm St · Unit 4B',
      detail: 'Open · Oct 1',
      href: '/tickets/t1',
    })
    expect(byType.thread[0]).toMatchObject({
      label: '(no subject)',
      hint: '9 Elm St · Unit 4B',
      detail: 'Open · Oct 2',
      href: '/inbox/th1',
    })
    expect(res.failed).toEqual([])
  })

  it('does not double a unit prefix that is already in the data', async () => {
    rows.hoa_property_list_v = [{ id: 'p3', address: '1 Sample Blvd', unit_number: 'Unit 4B', owner_name: null, unit_id: null }]
    const res = await searchRecords(client(), ORG, 'Sample')
    expect(res.groups[0].items[0].hint).toBe('Unit 4B')
  })

  it('omits empty groups and keeps a stable group order', async () => {
    rows.hoa_property_list_v = [P2]
    rows.tickets = [{ id: 't1', subject: 'Kaur gate', status: 'open', unit_id: null }]
    const res = await searchRecords(client(), ORG, 'Kaur')
    expect(res.groups.map((g) => g.type)).toEqual(['owner', 'ticket'])
  })

  it('reports a failing type in `failed` and still returns the others', async () => {
    rows.tickets = [{ id: 't1', subject: 'Kaur gate', status: 'open', unit_id: null }]
    errors.inbox_threads = { code: '42501', message: 'permission denied for 12 Kaur Lane' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await searchRecords(client(), ORG, 'Kaur')
    expect(res.failed).toEqual(['thread'])
    expect(res.groups.map((g) => g.type)).toEqual(['ticket'])
    // No PII in logs: ids and codes only — never the query or the DB message.
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).toContain('42501')
    expect(logged).not.toMatch(/kaur/i)
  })

  it('falls back to text-only matching when the property lookup fails', async () => {
    errors.hoa_property_list_v = { code: '57014', message: 'timeout' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await searchRecords(client(), ORG, 'Kaur')
    expect(res.failed).toEqual(['owner', 'property'])
    expect(orFilter('tickets')).toBe('subject.ilike.%Kaur%')
    expect(orFilter('hoa_violations')).toBe('violation_type.ilike.%Kaur%,description.ilike.%Kaur%')
  })

  it('tells apart several violations on the same lot by status and date', async () => {
    rows.hoa_property_list_v = [P2]
    rows.hoa_violations = [
      { id: 'v1', violation_type: 'Landscaping', status: 'open', property_id: 'p2', created_at: '2026-10-03T14:00:00Z' },
      { id: 'v2', violation_type: 'Landscaping', status: 'cured', property_id: 'p2', created_at: '2026-06-12T14:00:00Z' },
      { id: 'v3', violation_type: 'Landscaping', status: 'fined', property_id: 'p2', created_at: '2025-11-20T14:00:00Z' },
    ]
    const res = await searchRecords(client(), ORG, 'Kaur', OPTS)
    const items = res.groups.find((g) => g.type === 'violation')?.items ?? []
    expect(items.map((i) => i.detail)).toEqual(['Open · Oct 3', 'Cured · Jun 12', 'Fined · Nov 20, 2025'])
    expect(new Set(items.map((i) => `${i.label}|${i.hint}|${i.detail}`)).size).toBe(3)
  })

  it('dates a row by the association day, not the UTC day', async () => {
    // 9:30 PM Eastern on Oct 3 is already Oct 4 in UTC.
    rows.hoa_violations = [
      { id: 'v1', violation_type: 'Trash', status: 'open', property_id: null, created_at: '2026-10-04T01:30:00Z' },
    ]
    const east = await searchRecords(client(), ORG, 'trash', OPTS)
    expect(east.groups[0].items[0].detail).toBe('Open · Oct 3')
    const utc = await searchRecords(client(), ORG, 'trash', { timeZone: 'UTC', now: NOW })
    expect(utc.groups[0].items[0].detail).toBe('Open · Oct 4')
  })

  it('accepts the time zone as a promise, so the route can read it alongside the search', async () => {
    rows.tickets = [{ id: 't1', subject: 'Trash pickup', status: 'open', unit_id: null, created_at: '2026-10-04T01:30:00Z' }]
    const res = await searchRecords(client(), ORG, 'trash', { timeZone: Promise.resolve(TZ), now: NOW })
    expect(res.groups[0].items[0].detail).toBe('Open · Oct 3')
  })

  it('leaves out a missing date instead of printing a blank or "Invalid Date"', async () => {
    rows.tickets = [{ id: 't1', subject: 'Trash pickup', status: 'open', unit_id: null, created_at: null }]
    const res = await searchRecords(client(), ORG, 'trash', OPTS)
    expect(res.groups[0].items[0].detail).toBe('Open')
  })

  it('finds documents by name or title across uploaded and governing documents', async () => {
    rows.hoa_documents = [{ id: 'd1', name: 'Pool rules 2026', type: 'rules', created_at: '2026-03-02T14:00:00Z' }]
    rows.governing_documents = [
      { id: 'g1', title: 'Amended pool policy', type: 'policy', effective_date: '2025-07-01', created_at: '2025-07-02T14:00:00Z' },
    ]
    const res = await searchRecords(client(), ORG, 'pool', OPTS)
    expect(orFilter('hoa_documents')).toBe('name.ilike.%pool%')
    expect(orFilter('governing_documents')).toBe('title.ilike.%pool%')
    for (const t of ['hoa_documents', 'governing_documents']) {
      expect(opsFor(t), t).toContainEqual(['limit', SEARCH_LIMIT_PER_TYPE])
    }
    const docs = res.groups.find((g) => g.type === 'document')
    expect(docs?.label).toBe('Documents')
    expect(docs?.items).toEqual([
      { id: 'd1', type: 'document', label: 'Pool rules 2026', hint: 'Rules', detail: 'Mar 2', href: '/documents/d1' },
      {
        id: 'g1',
        type: 'document',
        label: 'Amended pool policy',
        hint: 'Governing · Policy',
        detail: 'Effective Jul 1, 2025',
        href: '/documents/governing',
      },
    ])
  })

  it('caps documents at the per-type limit across both tables', async () => {
    rows.hoa_documents = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: `Pool ${i}`, type: 'rules', created_at: null }))
    rows.governing_documents = Array.from({ length: 5 }, (_, i) => ({
      id: `g${i}`,
      title: `Pool ${i}`,
      type: 'policy',
      effective_date: null,
      created_at: null,
    }))
    const res = await searchRecords(client(), ORG, 'pool', OPTS)
    expect(res.groups.find((g) => g.type === 'document')?.items).toHaveLength(SEARCH_LIMIT_PER_TYPE)
  })

  it('finds meetings by type or summary and dates them by their meeting day', async () => {
    rows.hoa_meeting_minutes = [
      { id: 'm1', meeting_type: 'annual', meeting_date: '2026-10-03', status: 'approved' },
      { id: 'm2', meeting_type: null, meeting_date: '2025-12-09', status: 'draft' },
    ]
    const res = await searchRecords(client(), ORG, 'budget', OPTS)
    expect(orFilter('hoa_meeting_minutes')).toBe('meeting_type.ilike.%budget%,ai_summary.ilike.%budget%')
    expect(opsFor('hoa_meeting_minutes')).toContainEqual(['limit', SEARCH_LIMIT_PER_TYPE])
    const meetings = res.groups.find((g) => g.type === 'meeting')
    expect(meetings?.label).toBe('Meetings')
    expect(meetings?.items).toEqual([
      { id: 'm1', type: 'meeting', label: 'Annual meeting', hint: null, detail: 'Oct 3 · Approved', href: '/meetings/m1' },
      { id: 'm2', type: 'meeting', label: 'Board meeting', hint: null, detail: 'Dec 9, 2025 · Draft', href: '/meetings/m2' },
    ])
  })

  it('reports documents as failed when either documents table errors, and keeps what loaded', async () => {
    rows.hoa_documents = [{ id: 'd1', name: 'Pool rules', type: 'rules', created_at: null }]
    errors.governing_documents = { code: '42501', message: 'denied' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await searchRecords(client(), ORG, 'pool', OPTS)
    expect(res.failed).toEqual(['document'])
    expect(res.groups.find((g) => g.type === 'document')?.items).toHaveLength(1)
  })

  it('links every property row to the hoa_properties id, never the unit id', async () => {
    rows.hoa_property_list_v = [P1, P2]
    const res = await searchRecords(client(), ORG, 'Kaur', OPTS)
    const hrefs = res.groups.flatMap((g) => g.items.map((i) => i.href))
    expect(hrefs).toEqual(expect.arrayContaining(['/properties/p1', '/properties/p2']))
    expect(hrefs.some((h) => /\/properties\/u\d/.test(h))).toBe(false)
  })
})
