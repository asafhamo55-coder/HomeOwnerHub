import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-050: recordMeetingNoticePosted is inert until M1_APPLIED, and with
// the flag on writes only notice_posted_at, org-scoped, as board/admin.

const m1 = vi.hoisted(() => ({ value: false }))
vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return m1.value
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/dashboard/cached', () => ({ DASHBOARD_TAG_ALL: 'all' }))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'x', requireBoardOrAdminForAction: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
const role = vi.hoisted(() => ({ value: 'board' as string }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: vi.fn(async () => role.value) }))

const calls: Array<[string, unknown[]]> = []
const result = { data: [{ id: 'x' }] as unknown[] | null, error: null as { code: string } | null }
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    const b: Record<string, unknown> = {}
    for (const op of ['from', 'update', 'eq', 'is']) {
      b[op] = (...args: unknown[]) => {
        calls.push([op, args])
        return b
      }
    }
    b.select = async (...args: unknown[]) => {
      calls.push(['select', args])
      return result
    }
    return b
  },
}))

import { recordMeetingNoticePosted } from './meetings'

const MEETING = '0b6f4a7e-6a43-4c1e-9f55-1d1e3c1c0a01'

beforeEach(() => {
  calls.length = 0
  m1.value = false
  role.value = 'board'
  result.data = [{ id: MEETING }]
  result.error = null
})

describe('recordMeetingNoticePosted', () => {
  it('flag off: refuses and touches nothing', async () => {
    const r = await recordMeetingNoticePosted(MEETING, '2026-10-01T12:00:00Z')
    expect(r.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('flag on: writes notice_posted_at scoped to the org', async () => {
    m1.value = true
    const r = await recordMeetingNoticePosted(MEETING, '2026-10-01T12:00:00Z')
    expect(r).toEqual({ ok: true })
    expect(calls).toContainEqual(['update', [{ notice_posted_at: '2026-10-01T12:00:00Z' }]])
    expect(calls).toContainEqual(['eq', ['org_id', 'org-1']])
    expect(calls).toContainEqual(['eq', ['id', MEETING]])
  })

  it('flag on: a resident, a bad id, a future date or a missing row is refused', async () => {
    m1.value = true
    role.value = 'resident'
    expect((await recordMeetingNoticePosted(MEETING, '2026-10-01T12:00:00Z')).ok).toBe(false)
    role.value = 'board'
    expect((await recordMeetingNoticePosted('nope', '2026-10-01T12:00:00Z')).ok).toBe(false)
    expect((await recordMeetingNoticePosted(MEETING, '2999-01-01T00:00:00Z')).ok).toBe(false)
    result.data = []
    expect(await recordMeetingNoticePosted(MEETING, null)).toEqual({ ok: false, error: 'Meeting not found.' })
  })
})
