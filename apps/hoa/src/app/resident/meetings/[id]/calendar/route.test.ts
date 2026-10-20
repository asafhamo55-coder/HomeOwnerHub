import { beforeEach, describe, expect, it, vi } from 'vitest'

const MEETING = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'

const h = vi.hoisted(() => ({
  role: 'resident' as 'admin' | 'board' | 'resident' | null,
  meeting: null as null | { id: string; meeting_date: string; meeting_type: string | null; status: string | null },
  meetingError: null as null | { code: string; message: string },
  orgFilters: [] as Array<[string, unknown]>,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.role === null ? null : { id: 'user-1' } } }) },
  })),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.is = () => q
      q.eq = (col: string, v: unknown) => {
        if (col === 'org_id' || col === 'organization_id') h.orgFilters.push([col, v])
        return q
      }
      q.maybeSingle = async () => ({ data: h.meetingError ? null : h.meeting, error: h.meetingError })
      if (table === 'associations') {
        q.eq = (col: string, v: unknown) => {
          h.orgFilters.push([col, v])
          return Promise.resolve({ data: [{ name: 'Maple Grove HOA', state: 'FL' }], error: null })
        }
      }
      return q
    },
  }),
}))

import { GET } from './route'
import { signCalendarLink } from '@/lib/meetings/calendar-link-sign'

const SECRET = 'test-settings-secret'
process.env.PAY_SETTINGS_SECRET = SECRET
function signedQs(start: string | null, where: string | null, orgId = 'org-1', meetingId = MEETING): string {
  const q = new URLSearchParams()
  if (start) q.set('start', start)
  if (where) q.set('where', where)
  q.set('sig', signCalendarLink(SECRET, { orgId, meetingId, start, where }))
  return `?${q.toString()}`
}

function call(id: string, qs = '') {
  return GET(new Request(`https://app.example.com/resident/meetings/${id}/calendar${qs}`), {
    params: Promise.resolve({ id }),
  })
}

function future(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

beforeEach(() => {
  h.role = 'resident'
  h.meeting = { id: MEETING, meeting_date: future(10), meeting_type: 'regular', status: 'draft' }
  h.meetingError = null
  h.orgFilters = []
})

describe('GET /resident/meetings/[id]/calendar', () => {
  it('a resident gets an .ics for an upcoming scheduled meeting, org-scoped', async () => {
    const res = await call(MEETING, signedQs('19:00', 'Clubhouse'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="meeting-')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('LOCATION:Clubhouse')
    expect(body).not.toContain('DTSTART;VALUE=DATE:') // the signed time is honoured
    expect(body).toContain('SUMMARY:Maple Grove HOA: Board meeting')
    expect(h.orgFilters).toContainEqual(['org_id', 'org-1'])
  })

  it('L-3: an unsigned time and place are dropped; the invite keeps the date', async () => {
    const res = await call(MEETING, '?start=19%3A00&where=Evil+Lane')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).not.toContain('Evil Lane')
    expect(body).not.toContain('LOCATION:')
    expect(body).toContain('DTSTART;VALUE=DATE:')
  })

  it('L-3: a tampered place, time, or a signature for another meeting or org is refused', async () => {
    const good = signedQs('19:00', 'Clubhouse')
    const tamperedWhere = good.replace('where=Clubhouse', 'where=Evil+Lane')
    const tamperedStart = good.replace('start=19%3A00', 'start=03%3A00')
    const otherMeeting = signedQs('19:00', 'Evil Lane', 'org-1', '11111111-1111-4111-8111-111111111111')
    const otherOrg = signedQs('19:00', 'Evil Lane', 'org-2')
    const junk = '?start=19%3A00&where=Evil+Lane&sig=not-hex'
    for (const qs of [tamperedWhere, tamperedStart, otherMeeting, otherOrg, junk]) {
      const body = await (await call(MEETING, qs)).text()
      expect(body).not.toContain('LOCATION:')
      expect(body).toContain('DTSTART;VALUE=DATE:')
    }
  })

  it('signed out: 401 envelope', async () => {
    h.role = null
    const res = await call(MEETING)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('a resident gets 404 for an approved (held) or past meeting; the board still gets it', async () => {
    h.meeting = { id: MEETING, meeting_date: future(-3), meeting_type: 'regular', status: 'approved' }
    expect((await call(MEETING)).status).toBe(404)
    h.meeting = { id: MEETING, meeting_date: future(-3), meeting_type: 'regular', status: 'draft' }
    expect((await call(MEETING)).status).toBe(404)
    h.role = 'board'
    expect((await call(MEETING)).status).toBe(200)
  })

  it('unknown or foreign meeting: 404', async () => {
    h.meeting = null
    const res = await call(MEETING)
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })

  it('a malformed id or query: 400 validation_failed', async () => {
    expect((await call('not-a-uuid')).status).toBe(400)
    const res = await call(MEETING, '?start=7pm')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('validation_failed')
    expect((await call(MEETING, `?where=${'a'.repeat(201)}`)).status).toBeGreaterThanOrEqual(400)
  })

  it('a DB failure: generic 500, no raw text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.meetingError = { code: '42P01', message: 'relation "hoa_meeting_minutes" does not exist' }
    const res = await call(MEETING)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('hoa_meeting_minutes')
  })
})
