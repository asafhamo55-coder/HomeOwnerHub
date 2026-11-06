import { describe, expect, it, vi } from 'vitest'
import { calendarFeedSecret, feedUrls, feedVersionOf, signFeedToken, verifyFeedToken } from './token'
import { buildFeedIcs, feedEvents } from './build'
import { loadFeedData } from './load'
import { escapeIcsText, foldIcsLine } from '../ics'

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const O1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const O2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SECRET = 'x'.repeat(40)
const claims = { userId: U1, orgId: O1, version: 0 }

describe('feed token', () => {
  it('signs and verifies', () => {
    const t = signFeedToken(SECRET, claims)
    expect(verifyFeedToken(SECRET, t)).toEqual(claims)
  })

  it('rejects tampering with any part', () => {
    const t = signFeedToken(SECRET, claims)
    const [u, o, v, s] = t.split('.')
    expect(verifyFeedToken(SECRET, [U2, o, v, s].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, [u, O2, v, s].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, [u, o, '1', s].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, [u, o, v, s!.slice(0, -1) + (s!.endsWith('A') ? 'B' : 'A')].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, 'garbage')).toBeNull()
    // a leading-zero version is a different spelling of the same number: refused
    expect(verifyFeedToken(SECRET, [u, o, '00', s].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, [u, o, '01', s].join('.'))).toBeNull()
    expect(verifyFeedToken(SECRET, `${t}.extra`)).toBeNull()
  })

  it('rejects a token signed with another secret, and any token with no secret', () => {
    const t = signFeedToken(SECRET, claims)
    expect(verifyFeedToken('y'.repeat(40), t)).toBeNull()
    expect(verifyFeedToken(null, t)).toBeNull()
  })

  it('a new version is a different token', () => {
    expect(signFeedToken(SECRET, { ...claims, version: 1 })).not.toBe(signFeedToken(SECRET, claims))
  })

  it('reads the version from metadata, defaulting to 0', () => {
    expect(feedVersionOf({ calendar_feed_v: 3 })).toBe(3)
    expect(feedVersionOf({ calendar_feed_v: -1 })).toBe(0)
    expect(feedVersionOf({ calendar_feed_v: '2' })).toBe(0)
    expect(feedVersionOf(null)).toBe(0)
  })

  it('builds a webcal url', () => {
    expect(feedUrls('https://app.test/', 'tok')).toEqual({ https: 'https://app.test/calendar/tok', webcal: 'webcal://app.test/calendar/tok' })
  })
})

describe('missing secret hides the feed', () => {
  it('is null in production without CALENDAR_FEED_SECRET, even with a service key', () => {
    expect(calendarFeedSecret({ VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'svc' })).toBeNull()
    expect(verifyFeedToken(calendarFeedSecret({ VERCEL_ENV: 'production' }), signFeedToken(SECRET, claims))).toBeNull()
  })
  it('uses the dedicated secret when set', () => {
    expect(calendarFeedSecret({ VERCEL_ENV: 'production', CALENDAR_FEED_SECRET: SECRET })).toBe(SECRET)
  })
})

const NOW = new Date('2026-11-06T12:00:00Z')
const base = { associationName: 'Oak Glen, HOA', timeZone: 'America/New_York', origin: 'https://app.test', today: '2026-11-06', now: NOW }

describe('feed content and ICS validity', () => {
  const meetings = [
    { id: 'm-up', meeting_date: '2026-11-20', meeting_type: 'regular', status: 'draft', deleted_at: null },
    { id: 'm-past', meeting_date: '2026-10-20', meeting_type: 'annual', status: 'approved', deleted_at: null },
    { id: 'm-old', meeting_date: '2026-08-01', meeting_type: 'regular', status: 'approved', deleted_at: null },
    { id: 'm-pastdraft', meeting_date: '2026-10-25', meeting_type: 'regular', status: 'draft', deleted_at: null },
    { id: 'm-gone', meeting_date: '2026-11-25', meeting_type: 'special', status: 'draft', deleted_at: '2026-11-01T00:00:00Z' },
    // deleted but never visible: a past draft
    { id: 'm-hidden', meeting_date: '2026-10-25', meeting_type: 'special', status: 'draft', deleted_at: '2026-10-26T00:00:00Z' },
  ]
  const events = [
    { id: 'e1', title: 'Pool opens; bring ID, please', event_date: '2026-12-01', is_active: true, notify_audience: { kind: 'everyone' } },
    { id: 'e2', title: 'Board only', event_date: '2026-12-02', is_active: true, notify_audience: { kind: 'board' } },
    { id: 'e3', title: 'Dropped', event_date: '2026-12-03', is_active: false, notify_audience: { kind: 'everyone' } },
  ]

  it('keeps upcoming and last 30 days, drops old, withheld and non-public items', () => {
    const uids = feedEvents({ ...base, meetings, events }).map((e) => e.uid.split('@')[0])
    expect(uids).toEqual(['meeting-m-past', 'meeting-m-up', 'meeting-m-gone', 'event-e1-2026-12-01', 'event-e3-2026-12-03'])
  })

  it('writes a valid calendar with stable UIDs, cancelled status, escaping and folding', () => {
    const a = buildFeedIcs({ ...base, meetings, events })
    const b = buildFeedIcs({ ...base, meetings, events })
    expect(a).toBe(b)
    expect(a.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(a.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(a.match(/BEGIN:VEVENT/g)).toHaveLength(5)
    expect(a.match(/END:VEVENT/g)).toHaveLength(5)
    expect(a).toContain('X-WR-TIMEZONE:America/New_York')
    expect(a).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(a).toContain('SUMMARY:Oak Glen\\, HOA: Board meeting')
    expect(a).toContain('SUMMARY:Pool opens\\; bring ID\\, please')
    // exactly the two cancelled events carry STATUS:CANCELLED
    expect(a.match(/STATUS:CANCELLED/g)).toHaveLength(2)
    expect(a).toContain('UID:meeting-m-up@app.test')
    for (const line of a.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(a.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(a).not.toMatch(/ATTENDEE|ORGANIZER/)
    expect(a).not.toContain('Board only')
  })

  it('folds long lines on character boundaries and escapes text', () => {
    const folded = foldIcsLine('SUMMARY:' + 'é'.repeat(100))
    expect(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + 'é'.repeat(100))
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })
})

// A tiny fake admin client: tables of rows, filters recorded.
function fakeAdmin(opts: { metadata?: unknown; member?: unknown; userExists?: boolean; bannedUntil?: string }) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = []
  const tables: Record<string, unknown> = {
    org_members: opts.member === undefined ? { role: 'resident', access_expires_at: null } : opts.member,
    associations: [{ id: 'a1', name: 'Oak Glen', state: 'GA' }],
    hoa_meeting_minutes: [],
    hoa_recurring_events: [],
  }
  const from = (table: string) => {
    const filters: Record<string, unknown> = {}
    calls.push({ table, filters })
    const q: Record<string, unknown> = {}
    const chain = () => q
    for (const m of ['select', 'gte', 'order', 'limit']) q[m] = vi.fn(chain)
    q.eq = vi.fn((c: string, v: unknown) => ((filters[c] = v), q))
    q.is = vi.fn((c: string, v: unknown) => ((filters[`is:${c}`] = v), q))
    q.or = vi.fn((v: string) => ((filters.or = v), q))
    q.maybeSingle = vi.fn(async () => ({ data: tables[table], error: null }))
    q.then = (res: (v: unknown) => unknown) => res({ data: tables[table], error: null })
    return q
  }
  const getUserById = vi.fn(async (id: string) =>
    opts.userExists === false
      ? { data: { user: null }, error: { status: 404 } }
      : { data: { user: { id, user_metadata: opts.metadata ?? {}, banned_until: opts.bannedUntil ?? null } }, error: null },
  )
  return { admin: { from, auth: { admin: { getUserById } } }, calls }
}

describe('route data load: revocation and isolation', () => {
  it('loads for a current member on the current version', async () => {
    const { admin } = fakeAdmin({})
    expect((await loadFeedData(admin, claims, NOW)).ok).toBe(true)
  })

  it('refuses a revoked (older) version', async () => {
    const { admin } = fakeAdmin({ metadata: { calendar_feed_v: 1 } })
    expect(await loadFeedData(admin, claims, NOW)).toEqual({ ok: false, reason: 'denied' })
  })

  it('refuses a user that no longer exists, a non-member, an expired member and a professional', async () => {
    expect(await loadFeedData(fakeAdmin({ userExists: false }).admin, claims, NOW)).toEqual({ ok: false, reason: 'denied' })
    expect(await loadFeedData(fakeAdmin({ member: null }).admin, claims, NOW)).toEqual({ ok: false, reason: 'denied' })
    expect(
      await loadFeedData(fakeAdmin({ member: { role: 'resident', access_expires_at: '2026-01-01T00:00:00Z' } }).admin, claims, NOW),
    ).toEqual({ ok: false, reason: 'denied' })
    expect(await loadFeedData(fakeAdmin({ member: { role: 'cpa', access_expires_at: null } }).admin, claims, NOW)).toEqual({
      ok: false,
      reason: 'denied',
    })
  })

  it('refuses a suspended account, allows a lapsed suspension', async () => {
    expect(await loadFeedData(fakeAdmin({ bannedUntil: '2027-01-01T00:00:00Z' }).admin, claims, NOW)).toEqual({ ok: false, reason: 'denied' })
    expect((await loadFeedData(fakeAdmin({ bannedUntil: '2026-01-01T00:00:00Z' }).admin, claims, NOW)).ok).toBe(true)
  })

  it('pins every query to the token org and the org association ids', async () => {
    const { admin, calls } = fakeAdmin({})
    await loadFeedData(admin, claims, NOW)
    const t = (n: string) => calls.find((c) => c.table === n)!.filters
    expect(t('org_members')).toMatchObject({ org_id: O1, user_id: U1 })
    expect(t('associations')).toMatchObject({ organization_id: O1 })
    expect(t('hoa_meeting_minutes')).toMatchObject({ org_id: O1 })
    expect(t('hoa_recurring_events')).toMatchObject({ organization_id: O1, or: 'association_id.is.null,association_id.in.(a1)' })
    expect(JSON.stringify(calls)).not.toContain(O2)
  })

  it('a token for another org cannot be forged from this one', () => {
    const t = signFeedToken(SECRET, claims)
    const [u, , v, s] = t.split('.')
    expect(verifyFeedToken(SECRET, [u, O2, v, s].join('.'))).toBeNull()
  })
})
