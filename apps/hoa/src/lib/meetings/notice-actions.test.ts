import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  m1: false,
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  stamp: vi.fn(async (_c: unknown, opts: { m1: boolean }) => (opts.m1 ? 'stamped' : 'flag_off')),
}))

vi.mock('@homeowner-portal/db/m1', () => ({
  get M1_APPLIED() {
    return h.m1
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => ({})) }))
vi.mock('./notice-record', () => ({ stampNoticePosted: h.stamp }))

import { meetingCalendarParagraph, recordMeetingNoticeSent } from './notice-actions'
import { verifyCalendarLink } from './calendar-link-sign'

const MEETING = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const COMM = '5d1f0c3a-8e7b-4a6d-9c2f-0e1b2a3c4d5e'

beforeEach(() => {
  h.m1 = false
  h.gate = { ok: true, role: 'board', orgId: 'org-1' }
  h.stamp.mockClear()
})

describe('recordMeetingNoticeSent', () => {
  it('passes the M1 flag through: off → flag_off', async () => {
    expect(await recordMeetingNoticeSent(MEETING, COMM)).toEqual({ ok: true, outcome: 'flag_off' })
    expect(h.stamp.mock.calls[0][1]).toMatchObject({ m1: false, orgId: 'org-1', meetingId: MEETING, communicationId: COMM })
  })

  it('on → stamped', async () => {
    h.m1 = true
    expect(await recordMeetingNoticeSent(MEETING, COMM)).toEqual({ ok: true, outcome: 'stamped' })
    expect(h.stamp.mock.calls[0][1]).toMatchObject({ m1: true })
  })

  it('a resident is refused before anything runs', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await recordMeetingNoticeSent(MEETING, COMM)).toEqual({ ok: false, error: 'denied' })
    expect(h.stamp).not.toHaveBeenCalled()
  })

  it('bad ids are refused', async () => {
    expect((await recordMeetingNoticeSent('x', COMM)).ok).toBe(false)
    expect(h.stamp).not.toHaveBeenCalled()
  })
})

describe('meetingCalendarParagraph (L-3)', () => {
  const href = (html: string) => new URL(/href="([^"]+calendar[^"]*)"/.exec(html)![1].replace(/&amp;/g, '&'))

  it('signs the time and place for the board’s own org and this meeting', async () => {
    process.env.PAY_SETTINGS_SECRET = 'test-secret'
    const r = await meetingCalendarParagraph(MEETING, { time: '19:00', where: '  Clubhouse  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const url = href(r.html)
    expect(url.searchParams.get('start')).toBe('19:00')
    expect(url.searchParams.get('where')).toBe('Clubhouse')
    expect(
      verifyCalendarLink('test-secret', { orgId: 'org-1', meetingId: MEETING, start: '19:00', where: 'Clubhouse', sig: url.searchParams.get('sig') }),
    ).toBe(true)
  })

  it('refuses a non-board caller and a bad id', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await meetingCalendarParagraph(MEETING, { time: '19:00' })).toEqual({ ok: false, error: 'denied' })
    h.gate = { ok: true, role: 'board', orgId: 'org-1' }
    expect((await meetingCalendarParagraph('nope', {})).ok).toBe(false)
  })

  it('with no secret configured, the link carries the date only', async () => {
    const saved = { p: process.env.PAY_SETTINGS_SECRET, s: process.env.SUPABASE_SERVICE_ROLE_KEY, k: process.env.SUPABASE_SECRET_KEY }
    delete process.env.PAY_SETTINGS_SECRET
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SECRET_KEY
    try {
      const r = await meetingCalendarParagraph(MEETING, { time: '19:00', where: 'Clubhouse' })
      expect(r.ok && href(r.html).search).toBe('')
    } finally {
      if (saved.p !== undefined) process.env.PAY_SETTINGS_SECRET = saved.p
      if (saved.s !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.s
      if (saved.k !== undefined) process.env.SUPABASE_SECRET_KEY = saved.k
    }
  })
})
