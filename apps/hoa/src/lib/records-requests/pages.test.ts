import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-123 (3): with RECORDS_REQUESTS_LIVE off, no page, link or read exists —
// the resident form and the board view 404 before touching anything, and
// the two entry links are absent. With it on, the links appear.

const flag = vi.hoisted(() => ({ live: false }))
vi.mock('@homeowner-portal/db/records-requests', () => ({
  get RECORDS_REQUESTS_LIVE() {
    return flag.live
  },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: vi.fn(async () => {
    reads.n += 1
    return null
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}))
const reads = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => {
    reads.n += 1
    return { role: 'board', org: { id: 'org-1' } }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    reads.n += 1
    throw new Error('reached the database')
  }),
}))
const resUnits = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('@/lib/resident', () => ({
  getResidentUnits: vi.fn(async () => {
    reads.n += 1
    return resUnits.list
  }),
}))
vi.mock('@/lib/resident-tickets', () => ({ loadMyTickets: vi.fn(async () => ({ ok: true, data: [], count: 0 })) }))
vi.mock('@/lib/resident-submissions', () => ({
  loadMyArcRequests: vi.fn(async () => ({ ok: true, data: [] })),
  loadMyViolationReports: vi.fn(async () => ({ ok: true, data: [] })),
}))
vi.mock('@/lib/perf/timing', () => ({ timed: (_a: string, _b: string, fn: () => unknown) => fn() }))
vi.mock('@/lib/tickets', () => ({
  listTicketsForBoard: vi.fn(async () => ({
    ok: true,
    rows: [],
    total: 0,
    openCount: 0,
    statusCounts: { open: 0, in_progress: 0, closed: 0 },
  })),
}))

const { default: NewRecordsRequestPage } = await import('../../app/resident/records/new/page')
const { default: RecordsRequestsPage } = await import('../../app/(dashboard)/tickets/records/page')
const { default: FinancialPacketPage } = await import('../../app/(dashboard)/tickets/records/financial-packet/page')
const { default: ResidentRequestsPage } = await import('../../app/resident/requests/page')
const { default: TicketsPage } = await import('../../app/(dashboard)/tickets/page')
const { loadRecordsRequests } = await import('./queries')

/** Every href in a React element tree (without rendering function components). */
function hrefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) hrefs(n, out)
    return out
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props: Record<string, unknown> }).props
    if (typeof props.href === 'string') out.push(props.href)
    for (const v of Object.values(props)) if (v && typeof v === 'object') hrefs(v, out)
  }
  return out
}

beforeEach(() => {
  flag.live = false
  reads.n = 0
})

describe('flag off', () => {
  it('/resident/records/new is a 404 and reads nothing', async () => {
    await expect(NewRecordsRequestPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(reads.n).toBe(0)
  })

  it('/tickets/records is a 404 and reads nothing', async () => {
    expect(await loadRecordsRequests()).toBeNull()
    await expect(RecordsRequestsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(reads.n).toBe(0)
  })

  it('/tickets/records/financial-packet is a 404 and reads nothing (BL-162)', async () => {
    await expect(FinancialPacketPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(reads.n).toBe(0)
  })

  it('the resident Requests screen has no records link', async () => {
    const el = await ResidentRequestsPage()
    expect(hrefs(el)).not.toContain('/resident/records/new')
    expect(hrefs(el)).toContain('/resident/tickets/new')
  })

  it('the board Tickets page has no records link', async () => {
    const el = (await TicketsPage({ searchParams: Promise.resolve({}) })) as unknown as { props: { actions?: unknown } }
    expect(el.props.actions).toBeUndefined()
    expect(hrefs(el)).not.toContain('/tickets/records')
  })
})

describe('flag on', () => {
  beforeEach(() => {
    flag.live = true
  })

  it('both entry links appear', async () => {
    expect(hrefs(await ResidentRequestsPage())).toContain('/resident/records/new')
    const el = await TicketsPage({ searchParams: Promise.resolve({}) })
    expect(hrefs(el)).toContain('/tickets/records')
  })

  it('?kind=insurance_certificate presets the form; an unknown kind is ignored (BL-162)', async () => {
    resUnits.list = [{ unit_id: 'u1', unit_number: '4', address: null, association_id: 'a1', association_name: null }]
    const preset = (await NewRecordsRequestPage({ searchParams: Promise.resolve({ kind: 'insurance_certificate' }) })) as unknown
    const ignored = (await NewRecordsRequestPage({ searchParams: Promise.resolve({ kind: 'nope' }) })) as unknown
    const kinds = (n: unknown, out: unknown[] = []): unknown[] => {
      if (Array.isArray(n)) n.forEach((x) => kinds(x, out))
      else if (n && typeof n === 'object' && 'props' in n) {
        const p = (n as { props: Record<string, unknown> }).props
        if ('units' in p) out.push(p.defaultKind)
        for (const v of Object.values(p)) if (v && typeof v === 'object') kinds(v, out)
      }
      return out
    }
    expect(kinds(preset)).toEqual(['insurance_certificate'])
    expect(kinds(ignored)).toEqual([undefined])
    resUnits.list = []
  })

  it('the resident form renders for a signed-in resident', async () => {
    const el = await NewRecordsRequestPage()
    expect(el).toBeTruthy()
    expect(reads.n).toBe(1)
  })
})
