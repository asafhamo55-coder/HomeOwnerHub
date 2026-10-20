import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))

let minutes: Array<Record<string, unknown>> = []
let readError: { code: string; message: string } | null = null
const ops: Array<[string, ...unknown[]]> = []

function builder() {
  let range: [number, number] = [0, 0]
  const b: Record<string, unknown> = {
    range(from: number, to: number) {
      range = [from, to]
      return b
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      const res = readError ? { data: null, error: readError } : { data: minutes.slice(range[0], range[1] + 1), error: null }
      return Promise.resolve(res).then(resolve, reject)
    },
  }
  for (const op of ['select', 'eq', 'is', 'order']) {
    b[op] = (...args: unknown[]) => {
      ops.push([op, ...args])
      return b
    }
  }
  return b
}

const getSupabaseServerClient = vi.fn(async () => ({ from: () => builder() }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: () => getSupabaseServerClient() }))

import { GET as rawGET } from './route'

const GET = (qs = '') => rawGET(new Request(`http://x/api/meetings/motions/export${qs}`))

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  minutes = [
    {
      id: 'm1',
      meeting_date: '2026-03-10',
      meeting_type: 'annual',
      status: 'approved',
      motions: [{ text: '=HYPERLINK("x") Adopt budget', result: 'passed', yea: 5, nay: 0 }],
      ai_summary: null,
    },
    {
      id: 'm2',
      meeting_date: '2025-09-01',
      meeting_type: 'regular',
      status: 'draft',
      motions: null,
      ai_summary: 'Decisions Made\n- Motion to replace the fence failed 2-3',
    },
  ]
  readError = null
  ops.length = 0
  getSupabaseServerClient.mockClear()
})

describe('GET /api/meetings/motions/export', () => {
  it('403s a resident before any client is made', async () => {
    gate = { ok: false, error: DENIED }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('400s a bad filter', async () => {
    const res = await GET('?result=maybe')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
  })

  it('exports every motion, org-scoped and live meetings only, through the CSV helper', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const csv = await res.text()
    expect(csv).toContain('Recorded motion')
    expect(csv).toContain('From minutes text')
    expect(csv).toContain('/meetings/m2')
    // Formula guard from lib/csv.
    expect(csv).toContain("'=HYPERLINK")
    expect(ops).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(ops).toContainEqual(['is', 'deleted_at', null])
  })

  it('applies the filters', async () => {
    const csv = await (await GET('?year=2025&result=failed&q=fence')).text()
    expect(csv).toContain('replace the fence')
    expect(csv).not.toContain('budget')
  })

  it('500s with the generic envelope when the read fails', async () => {
    readError = { code: '57014', message: 'canceling statement' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('canceling')
    err.mockRestore()
  })
})
