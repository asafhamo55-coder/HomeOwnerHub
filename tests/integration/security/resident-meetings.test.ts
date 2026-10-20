/**
 * BL-088: a resident never reads draft minutes, raw transcripts or
 * attendees, and never another org's meetings.
 *
 * Since 0063 hoa_meeting_minutes is board-only, so a resident reads no
 * row of it at all; the resident page reads through
 * `resident_meeting_notices()` instead, which migration 0065 installs
 * (same SQL as docs/specs/2026-10-19-resident-meeting-notices.sql,
 * runbook C1). These tests pin both halves:
 *   - the table, read directly as a signed-in resident, returns no draft
 *     (and no transcript) whatever filters the resident sends;
 *   - the page's own read (fetchResidentMeetings) is available, returns
 *     the approved minutes and the posted agenda, and never a draft's
 *     minutes, a transcript or anything from another org.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion
 * runs through a user's own client.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fetchResidentMeetings, type MeetingsClient } from '../../../apps/hoa/src/lib/resident-meetings/query'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const TODAY = '2026-10-19'
const SECRET = 'executive session: litigation strategy'

interface Seeded {
  org: OrgFixture
  board: TestUser
  resident: TestUser
  outsider: TestUser
  ids: { draftPast: string; approvedPast: string; scheduled: string; otherOrgApproved: string }
}

async function seed(): Promise<Seeded> {
  const org = await makeOrg()
  const other = await makeOrg()
  const board = await mintUser(org, 'board')
  const resident = await mintUser(org, 'resident')
  const outsider = await mintUser(other, 'resident')
  const db = adminDb()

  const insert = async (orgId: string, fields: Record<string, unknown>) => {
    const { data, error } = await db
      .from('hoa_meeting_minutes')
      .insert({ org_id: orgId, meeting_type: 'regular', ...fields } as never)
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed hoa_meeting_minutes: ${error?.code}`)
    return (data as { id: string }).id
  }

  return {
    org,
    board,
    resident,
    outsider,
    ids: {
      draftPast: await insert(org.orgId, {
        meeting_date: '2026-09-15',
        status: 'draft',
        ai_summary: 'DRAFT minutes not yet approved',
        raw_transcript: SECRET,
        attendees: ['Board member A'],
      }),
      approvedPast: await insert(org.orgId, {
        meeting_date: '2026-08-15',
        status: 'approved',
        ai_summary: 'Approved minutes',
        raw_transcript: SECRET,
        attendees: ['Board member A'],
      }),
      // Far future so the function's "draft and not yet past" window
      // (meeting_date >= current_date - 1) holds whenever CI runs.
      scheduled: await insert(org.orgId, { meeting_date: '2099-01-10', status: 'draft', ai_summary: 'Agenda' }),
      otherOrgApproved: await insert(other.orgId, {
        meeting_date: '2026-08-01',
        status: 'approved',
        ai_summary: 'Other org minutes',
      }),
    },
  }
}

describe('resident meetings', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a resident reading the table directly gets no draft minutes and no transcript', async () => {
    const s = await seed()
    const asked = await s.resident.client
      .from('hoa_meeting_minutes')
      .select('id, status, ai_summary, raw_transcript, attendees')
      .eq('status', 'draft')
    expect(asked.data ?? []).toEqual([])

    const all = await s.resident.client.from('hoa_meeting_minutes').select('id, status, raw_transcript')
    const ids = (all.data ?? []).map((r) => r.id)
    expect(ids).not.toContain(s.ids.draftPast)
    expect(ids).not.toContain(s.ids.otherOrgApproved)
    expect(JSON.stringify(all.data ?? [])).not.toContain(SECRET)
  })

  it('the board still reads its own drafts (the fixture is live)', async () => {
    const s = await seed()
    const { data, error } = await s.board.client.from('hoa_meeting_minutes').select('id').eq('id', s.ids.draftPast)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id)).toEqual([s.ids.draftPast])
  })

  it('the resident page read never returns a draft, a transcript or another org', async () => {
    const s = await seed()
    const r = await fetchResidentMeetings(s.resident.client as unknown as MeetingsClient, {
      orgId: s.org.orgId,
      today: TODAY,
      timeZone: 'America/New_York',
    })
    // 0065 installs resident_meeting_notices(): the page must not fall
    // back to "not available yet".
    expect(r.available).toBe(true)
    if (!r.available) return
    const past = r.past.map((m) => m.id)
    expect(past).toEqual([s.ids.approvedPast])
    expect(r.past[0]?.minutes).toBe('Approved minutes')
    expect(r.upcoming.map((m) => m.id)).toEqual([s.ids.scheduled])
    expect(past).not.toContain(s.ids.draftPast)
    expect(past).not.toContain(s.ids.otherOrgApproved)
    expect(r.upcoming.map((m) => m.id)).not.toContain(s.ids.draftPast)
    expect(JSON.stringify(r)).not.toContain(SECRET)
    expect(JSON.stringify(r)).not.toContain('DRAFT minutes')
  })

  it("another org's resident reads none of it", async () => {
    const s = await seed()
    const { data } = await s.outsider.client
      .from('hoa_meeting_minutes')
      .select('id')
      .in('id', [s.ids.draftPast, s.ids.approvedPast, s.ids.scheduled])
    expect(data ?? []).toEqual([])
    const r = await fetchResidentMeetings(s.outsider.client as unknown as MeetingsClient, {
      orgId: s.org.orgId,
      today: TODAY,
      timeZone: 'America/New_York',
    })
    expect(r.available).toBe(true)
    if (r.available) {
      expect(r.past).toEqual([])
      expect(r.upcoming).toEqual([])
    }
  })
})
