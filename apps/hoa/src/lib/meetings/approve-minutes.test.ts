import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { approveExistingMinutes, canApproveMinutes } from './approve-minutes'
import { needsMinutes } from './meetings-list'
import { selectResidentMeetings } from '../resident-meetings/select'

const TODAY = '2026-10-30'
const ORG = 'org-1'
const MEETING = 'm-1'

interface Row {
  id: string
  org_id: string
  status: string | null
  approved_at: string | null
  ai_summary: string | null
}

/** A tiny in-memory stand-in for the two tables the core touches. */
function fakeDb(rows: Row[]) {
  const audit: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  const db = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = []
      let patch: Record<string, unknown> | null = null
      const matches = (r: Row) =>
        filters.every(([op, k, v]) => {
          const val = (r as unknown as Record<string, unknown>)[k]
          if (op === 'eq') return val === v
          if (op === 'neq') return val !== v
          return true
        })
      const b: Record<string, unknown> = {}
      b.select = () => {
        if (patch) {
          const hit = rows.filter(matches)
          for (const r of hit) Object.assign(r, patch)
          if (hit.length) updates.push(patch)
          return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
        }
        return b
      }
      b.update = (p: Record<string, unknown>) => ((patch = p), b)
      b.eq = (k: string, v: unknown) => (filters.push(['eq', k, v]), b)
      b.neq = (k: string, v: unknown) => (filters.push(['neq', k, v]), b)
      b.is = () => b
      b.maybeSingle = () => Promise.resolve({ data: rows.find(matches) ?? null, error: null })
      b.insert = (v: Record<string, unknown>) => {
        if (table === 'audit_log') audit.push(v)
        return Promise.resolve({ error: null })
      }
      return b
    },
  }
  return { db: db as unknown as SupabaseClient<Database>, audit, updates }
}

const base = (over: Partial<Row> = {}): Row => ({
  id: MEETING,
  org_id: ORG,
  status: 'draft',
  approved_at: null,
  ai_summary: 'The board met and approved the budget.',
  ...over,
})
const args = { orgId: ORG, meetingId: MEETING, userId: 'u-1', role: 'board' as const }

describe('canApproveMinutes: when the button shows', () => {
  const m = { meeting_date: '2026-10-01', status: 'draft', approved_at: null, ai_summary: 'Minutes text' }
  it('shows for a past, unapproved meeting with minutes', () => {
    expect(canApproveMinutes(m, TODAY)).toBe(true)
  })
  it('hides for a future or same-day meeting', () => {
    expect(canApproveMinutes({ ...m, meeting_date: '2026-11-05' }, TODAY)).toBe(false)
    expect(canApproveMinutes({ ...m, meeting_date: TODAY }, TODAY)).toBe(false)
  })
  it('hides when minutes are empty or blank', () => {
    expect(canApproveMinutes({ ...m, ai_summary: null }, TODAY)).toBe(false)
    expect(canApproveMinutes({ ...m, ai_summary: '  \n' }, TODAY)).toBe(false)
  })
  it('hides once approved, by status or by stamp, and when archived', () => {
    expect(canApproveMinutes({ ...m, status: 'approved' }, TODAY)).toBe(false)
    expect(canApproveMinutes({ ...m, approved_at: '2026-10-02T00:00:00Z' }, TODAY)).toBe(false)
    expect(canApproveMinutes({ ...m, status: 'archived' }, TODAY)).toBe(false)
  })
})

describe('approveExistingMinutes', () => {
  it('sets status and approved_at and writes an audit row', async () => {
    const rows = [base()]
    const { db, audit } = fakeDb(rows)
    const now = new Date('2026-10-30T12:00:00Z')
    const r = await approveExistingMinutes(db, { ...args, now })
    expect(r).toEqual({ ok: true, alreadyApproved: false })
    expect(rows[0].status).toBe('approved')
    expect(rows[0].approved_at).toBe(now.toISOString())
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ org_id: ORG, action: 'meeting.minutes_approved', entity_id: MEETING })
  })

  it('is idempotent: a second call changes nothing and adds no audit row', async () => {
    const rows = [base()]
    const { db, audit, updates } = fakeDb(rows)
    await approveExistingMinutes(db, args)
    const stamp = rows[0].approved_at
    const again = await approveExistingMinutes(db, { ...args, now: new Date('2027-01-01T00:00:00Z') })
    expect(again).toEqual({ ok: true, alreadyApproved: true })
    expect(rows[0].approved_at).toBe(stamp)
    expect(audit).toHaveLength(1)
    expect(updates).toHaveLength(1)
  })

  it('cannot touch another org\'s meeting', async () => {
    const rows = [base({ org_id: 'org-2' })]
    const { db, audit } = fakeDb(rows)
    const r = await approveExistingMinutes(db, args)
    expect(r).toEqual({ ok: false, error: 'Meeting not found.' })
    expect(rows[0].status).toBe('draft')
    expect(audit).toHaveLength(0)
  })

  it('refuses a meeting with no minutes', async () => {
    const rows = [base({ ai_summary: ' ' })]
    const { db } = fakeDb(rows)
    const r = await approveExistingMinutes(db, args)
    expect(r.ok).toBe(false)
    expect(rows[0].status).toBe('draft')
  })
})

describe('after approval', () => {
  it('the meetings list stops flagging it', () => {
    const m = { meeting_date: '2026-10-01', meeting_type: 'regular', status: 'draft', approved_at: null }
    expect(needsMinutes(m, TODAY)).toBe(true)
    expect(needsMinutes({ ...m, status: 'approved', approved_at: '2026-10-30T12:00:00Z' }, TODAY)).toBe(false)
  })

  it('the resident query includes the meeting only once approved', () => {
    const row = {
      id: 'm-1',
      org_id: ORG,
      meeting_date: '2026-10-01',
      meeting_type: 'regular',
      status: 'draft',
      body: 'The board met and approved the budget.',
      updated_at: '2026-10-02T15:00:00Z',
    }
    const opts = { orgId: ORG, today: TODAY, timeZone: 'America/New_York' }
    expect(selectResidentMeetings([row], opts).past).toEqual([])
    expect(selectResidentMeetings([{ ...row, status: 'approved' }], opts).past.map((p) => p.id)).toEqual(['m-1'])
  })
})

describe('approveMeetingMinutesById: who may call it', () => {
  it('rejects a resident before touching the database', async () => {
    vi.resetModules()
    const from = vi.fn()
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
    vi.doMock('next/navigation', () => ({ redirect: vi.fn() }))
    vi.doMock('@/lib/dashboard/cached', () => ({ DASHBOARD_TAG_ALL: 'all' }))
    vi.doMock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn() }))
    vi.doMock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: vi.fn() }))
    vi.doMock('@homeowner-portal/db/m1', () => ({ M1_APPLIED: false }))
    vi.doMock('@/lib/accounting/guard', () => ({
      BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
      requireBoardOrAdminForAction: vi.fn(async () => ({ ok: false, error: 'Only board members and admins can make this change.' })),
    }))
    vi.doMock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => ({ from }) }))
    const { approveMeetingMinutesById } = await import('../meetings')
    const r = await approveMeetingMinutesById('0b6f4a7e-6a43-4c1e-9f55-1d1e3c1c0a01')
    expect(r).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(from).not.toHaveBeenCalled()
  })
})
