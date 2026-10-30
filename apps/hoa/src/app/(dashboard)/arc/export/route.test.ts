import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DENIED = 'Only board members and admins can make this change.'
let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = {
  ok: true,
  role: 'board',
  orgId: 'org-1',
}
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))
let signedIn = true
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'u' } : null } }) },
  })),
}))

type Row = {
  id: string
  association_id: string | null
  unit_id: string | null
  unit_number: string | null
  submitted_by: string
  submitter_name: string | null
  submitter_email: string | null
  category: string
  summary: string
  status: string
  submitted_at: string
  board_response_at: string | null
}
let rows: Row[] = []
const loaderCalls: Array<{ status?: string | string[]; from?: number; to?: number; oldestFirst?: boolean }> = []
vi.mock('@/lib/board-review', () => ({
  listArcRequestsForBoard: vi.fn(
    async (opts: { status?: string | string[]; from?: number; to?: number; oldestFirst?: boolean }) => {
      loaderCalls.push(opts)
      const statuses = opts.status ? ([] as string[]).concat(opts.status) : null
      const all = statuses ? rows.filter((r) => statuses.includes(r.status)) : rows
      return { ok: true, total: all.length, rows: all.slice(opts.from ?? 0, (opts.to ?? 99) + 1) }
    },
  ),
}))
vi.mock('@/lib/arc-review/clock-actions', () => ({
  getArcClockSettings: vi.fn(async () => ({
    ok: true,
    associations: [
      {
        association: { id: 'assoc-1', name: 'Oak HOA', state: 'GA' },
        state: 'verified',
        settings: { days: 30, dayKind: 'calendar' },
      },
    ],
  })),
}))

import { GET as rawGET } from './route'

const GET = (qs = '') => rawGET(new Request(`http://x/arc/export${qs}`))
const lines = async (res: Response) => (await res.text()).replace('﻿', '').trim().split('\r\n')

function arc(n: number, over: Partial<Row> = {}): Row {
  return {
    id: `a${n}`,
    association_id: 'assoc-1',
    unit_id: 'u1',
    unit_number: '12',
    submitted_by: 'user-1',
    submitter_name: 'Ann Ames',
    submitter_email: 'ann@x.test',
    category: 'fence',
    summary: `Fence ${n}`,
    status: 'submitted',
    submitted_at: '2026-10-01T15:00:00Z',
    board_response_at: null,
    ...over,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T16:00:00Z'))
  signedIn = true
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  loaderCalls.length = 0
  rows = [
    arc(1),
    arc(2, { status: 'approved', board_response_at: '2026-10-10T18:00:00Z' }),
    arc(3, { status: 'denied', board_response_at: '2026-10-12T18:00:00Z' }),
  ]
})
afterEach(() => vi.useRealTimers())

describe('GET /arc/export', () => {
  it('refuses a resident with 403 before reading anything', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(loaderCalls).toHaveLength(0)
  })

  it('refuses a signed-out caller with 401', async () => {
    gate = { ok: false, error: 'You are not signed in to an organization.' }
    signedIn = false
    const res = await GET()
    expect(res.status).toBe(401)
    expect(loaderCalls).toHaveLength(0)
  })

  it('keeps only rows from the caller organization associations', async () => {
    rows = [arc(1), arc(2, { association_id: 'assoc-other', summary: 'Someone else' })]
    const csv = await (await GET()).text()
    expect(csv).toContain('Fence 1')
    expect(csv).not.toContain('Someone else')
  })

  it('defaults to the work queue, oldest first, with the seven columns and no submitter', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="arc-pending-2026-10-30.csv"')
    expect(loaderCalls[0]).toMatchObject({ status: ['submitted', 'in_review'], oldestFirst: true })
    const out = await lines(res)
    expect(out[0]).toBe('Unit,Category,Summary,Status,Submitted,Decide by,Decision date')
    expect(out).toHaveLength(2)
    expect(out[1]).toMatch(/^12,.*,Fence 1,.*,2026-10-01,2026-10-31,$/)
    const all = out.join('\n')
    expect(all).not.toContain('Ann')
    expect(all).not.toContain('@')
  })

  it('follows the status filter and shows the decision date, with no decide-by once decided', async () => {
    const res = await GET('?status=approved')
    expect(res.headers.get('content-disposition')).toContain('arc-approved-2026-10-30.csv')
    expect(loaderCalls[0]).toMatchObject({ status: ['approved'], oldestFirst: false })
    const out = await lines(res)
    expect(out).toHaveLength(2)
    expect(out[1]).toMatch(/,2026-10-01,,2026-10-10$/)
  })

  it('exports every status for all and treats an unknown status as the work queue', async () => {
    expect(await lines(await GET('?status=all'))).toHaveLength(4)
    loaderCalls.length = 0
    await GET('?status=bogus')
    expect(loaderCalls[0]).toMatchObject({ status: ['submitted', 'in_review'] })
  })

  it('neutralises a leading = in the summary', async () => {
    rows = [arc(1, { summary: '=HYPERLINK("http://evil","x")' })]
    const csv = await (await GET()).text()
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m)
  })

  it('pages past the 1000-row cap', async () => {
    rows = Array.from({ length: 1500 }, (_, i) => arc(i))
    const out = await lines(await GET())
    expect(out).toHaveLength(1501)
    expect(loaderCalls.map((c) => [c.from, c.to])).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})
