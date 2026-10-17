import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { cappedFakeDb, rangesFor } from '@/lib/supabase/capped-fake-db'

/**
 * BL-053: the CSV exports promised "everything on the page", but each was a
 * single read and PostgREST caps every response at 1000 rows — an HOA with
 * 1,400 properties downloaded 1,000 and nothing said so. The fake enforces
 * that cap; every fixture is over it.
 */
let db: SupabaseClient
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => db }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org-1' }) }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'A' }) }))

const { GET: exportProperties } = await import('./properties/export/route')
const { GET: exportViolations } = await import('./violations/export/route')
const { GET: exportLeases } = await import('./leases/export/route')

const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
const N = 2345
const req = (path: string) => new NextRequest(`http://localhost${path}`)
/** Data rows in a CSV body (minus the BOM'd header). lib/csv ends every
 *  record with CRLF (BL-045), so the trailing empty split is dropped. */
const dataLines = async (res: Response) => (await res.text()).split('\r\n').filter(Boolean).length - 1

describe('properties CSV export', () => {
  const props = Array.from({ length: N }, (_, i) => ({
    id: id('p', i),
    org_id: 'org-1',
    address: id('addr', i),
    unit_number: null,
    owner_name: null,
    owner_email: null,
    owner_phone: null,
    tenure: i % 7 === 0 ? 'leased' : 'owner_occupied',
    notes: null,
    created_at: null,
    updated_at: null,
    // Read from the list view now (the same rows the page shows).
    has_owner: false,
    has_tenure: true,
    needs_attention: i % 5 === 0,
    on_waiting_list: false,
    severity_rank: 6,
  }))

  it('exports every property, not the first 1000', async () => {
    const fake = cappedFakeDb({ hoa_property_list_v: props })
    db = fake.db
    const res = await exportProperties(req('/properties/export'))
    expect(res.status).toBe(200)
    expect(await dataLines(res)).toBe(N)
    expect(rangesFor(fake.calls, 'hoa_property_list_v').length).toBeGreaterThan(2)
  })

  it('a failed later page is a 500, never a short file', async () => {
    db = cappedFakeDb({ hoa_property_list_v: props }, { failAt: { table: 'hoa_property_list_v', from: 1000 } }).db
    const res = await exportProperties(req('/properties/export'))
    expect(res.status).toBe(500)
  })
})

describe('properties CSV export follows the view', () => {
  const props = Array.from({ length: 30 }, (_, i) => ({
    id: id('p', i),
    org_id: 'org-1',
    address: `${[1200, 128, 13][i % 3]} Oak St ${i}`,
    tenure: i % 2 === 0 ? 'leased' : 'owner_occupied',
    has_owner: true,
    has_tenure: true,
    needs_attention: i % 3 === 0,
    on_waiting_list: i === 4,
    severity_rank: 6,
  }))

  it('?filter=attention exports only the homes needing attention', async () => {
    db = cappedFakeDb({ hoa_property_list_v: props }).db
    const res = await exportProperties(req('/properties/export?filter=attention'))
    expect(await dataLines(res)).toBe(10)
    expect(res.headers.get('content-disposition')).toContain('properties-attention-')
  })

  it('?filter=waiting exports the queue, and the old ?tenure= spelling still works', async () => {
    db = cappedFakeDb({ hoa_property_list_v: props }).db
    expect(await dataLines(await exportProperties(req('/properties/export?filter=waiting')))).toBe(1)
    db = cappedFakeDb({ hoa_property_list_v: props }).db
    expect(await dataLines(await exportProperties(req('/properties/export?tenure=leased')))).toBe(15)
  })

  it('rows come out in natural address order', async () => {
    db = cappedFakeDb({ hoa_property_list_v: props }).db
    const lines = (await (await exportProperties(req('/properties/export'))).text()).split('\r\n').filter(Boolean).slice(1)
    const numbers = lines.map((l) => Number(l.split(' ')[0].replace(/\D/g, '')))
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })
})

describe('violations CSV export', () => {
  const violations = Array.from({ length: N }, (_, i) => ({
    id: id('v', i),
    org_id: 'org-1',
    deleted_at: null,
    description: 'x',
    status: 'open',
    severity: null,
    ccr_section: null,
    created_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
    notice_sent_at: null,
    property: { address: 'a', unit_number: null },
  }))

  it('exports every violation, not the first 1000', async () => {
    db = cappedFakeDb({ hoa_violations: violations }).db
    const res = await exportViolations(req('/violations/export'))
    expect(res.status).toBe(200)
    expect(await dataLines(res)).toBe(N)
  })

  it('a failed later page is a 500, never a short file', async () => {
    db = cappedFakeDb({ hoa_violations: violations }, { failAt: { table: 'hoa_violations', from: 1000 } }).db
    const res = await exportViolations(req('/violations/export'))
    expect(res.status).toBe(500)
  })
})

describe('leases (waiting list) CSV export', () => {
  const entries = Array.from({ length: N }, (_, i) => ({
    id: id('w', i),
    association_id: 'assoc-1',
    property_id: id('p', i),
    requested_at: id('2026-01-01T', i),
    status: 'waiting',
    notes: null,
    status_updated_at: '2026-02-01T00:00:00Z',
    property: { address: id('addr', i), unit_number: null, owner_name: null },
  }))

  it('exports every entry, with its status date, not the first 1000', async () => {
    db = cappedFakeDb({ lease_waiting_list: entries }).db
    const res = await exportLeases()
    expect(res.status).toBe(200)
    const lines = (await res.text()).split('\r\n').filter(Boolean).slice(1)
    expect(lines).toHaveLength(N)
    expect(lines.every((l) => l.includes('2026-02-01T00:00:00Z'))).toBe(true)
  })

  it('a failed later page is a 500, never a short file', async () => {
    db = cappedFakeDb({ lease_waiting_list: entries }, { failAt: { table: 'lease_waiting_list', from: 1000 } }).db
    const res = await exportLeases()
    expect(res.status).toBe(500)
  })
})
