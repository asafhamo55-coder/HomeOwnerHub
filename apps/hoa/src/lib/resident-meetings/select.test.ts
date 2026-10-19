import { describe, expect, it } from 'vitest'
import {
  RESIDENT_MEETING_COLUMNS,
  agendaIsSafe,
  formatMeetingDate,
  meetingTypeLabel,
  selectResidentMeetings,
  type ResidentMeetingRow,
} from './select'

const ORG = 'org-1'
const TODAY = '2026-10-19'
const ET = 'America/New_York'
const opts = { orgId: ORG, today: TODAY, timeZone: ET }

function row(over: Partial<ResidentMeetingRow>): ResidentMeetingRow {
  return {
    id: over.id ?? 'm',
    org_id: ORG,
    meeting_date: '2026-11-05',
    meeting_type: 'regular',
    status: 'draft',
    body: 'Agenda text',
    updated_at: '2026-10-01T15:00:00Z',
    ...over,
  }
}

describe('selectResidentMeetings: what a resident may see', () => {
  it('shows a scheduled (draft, future) meeting with its agenda', () => {
    const r = selectResidentMeetings([row({ id: 'up' })], opts)
    expect(r.upcoming).toEqual([{ id: 'up', date: '2026-11-05', typeLabel: 'Board meeting', agenda: 'Agenda text' }])
    expect(r.past).toEqual([])
  })

  it('shows past minutes only when approved', () => {
    const r = selectResidentMeetings(
      [
        row({ id: 'approved', status: 'approved', meeting_date: '2026-09-10', body: 'Approved minutes' }),
        row({ id: 'draft-minutes', status: 'draft', meeting_date: '2026-09-20', body: 'DRAFT minutes' }),
      ],
      opts,
    )
    expect(r.past.map((m) => m.id)).toEqual(['approved'])
    expect(r.upcoming).toEqual([])
    expect(JSON.stringify(r)).not.toContain('DRAFT')
  })

  it('never shows a past draft, even yesterday', () => {
    const r = selectResidentMeetings([row({ meeting_date: '2026-10-18', body: 'DRAFT' })], opts)
    expect(r).toEqual({ upcoming: [], past: [] })
  })

  it('drops unknown statuses, deleted rows, other orgs and bad dates', () => {
    const r = selectResidentMeetings(
      [
        row({ id: 'closed', status: 'executive' }),
        row({ id: 'null-status', status: null }),
        row({ id: 'deleted', deleted_at: '2026-10-02T00:00:00Z' }),
        row({ id: 'other-org', org_id: 'org-2' }),
        row({ id: 'bad-date', meeting_date: 'soon' }),
        row({ id: 'past-other-org', org_id: 'org-2', status: 'approved', meeting_date: '2026-01-01' }),
      ],
      opts,
    )
    expect(r).toEqual({ upcoming: [], past: [] })
  })

  it('a future "approved" row is neither upcoming nor past', () => {
    const r = selectResidentMeetings([row({ status: 'approved', meeting_date: '2026-12-01', body: 'x' })], opts)
    expect(r).toEqual({ upcoming: [], past: [] })
  })

  it('today counts as upcoming, in the association zone', () => {
    expect(selectResidentMeetings([row({ meeting_date: TODAY, updated_at: '2026-10-10T00:00:00Z' })], opts).upcoming).toHaveLength(1)
    // An approved meeting held today is not "past" until tomorrow.
    expect(selectResidentMeetings([row({ status: 'approved', meeting_date: TODAY })], opts).past).toEqual([])
  })

  it('withholds a draft text edited on or after the meeting day (it may be draft minutes)', () => {
    const r = selectResidentMeetings(
      [
        row({ id: 'same-day', meeting_date: TODAY, updated_at: '2026-10-19T23:00:00Z', body: 'DRAFT minutes' }),
        row({ id: 'no-stamp', updated_at: null, body: 'unknown text' }),
      ],
      opts,
    )
    expect(r.upcoming.map((m) => [m.id, m.agenda])).toEqual([
      ['same-day', null],
      ['no-stamp', null],
    ])
  })

  it('drops approved rows that have no minutes text', () => {
    const r = selectResidentMeetings([row({ status: 'approved', meeting_date: '2026-09-01', body: '   ' })], opts)
    expect(r.past).toEqual([])
  })

  it('sorts upcoming soonest first and past newest first, once each', () => {
    const r = selectResidentMeetings(
      [
        row({ id: 'b', meeting_date: '2026-12-01' }),
        row({ id: 'a', meeting_date: '2026-11-01' }),
        row({ id: 'a', meeting_date: '2026-11-01' }),
        row({ id: 'old', status: 'approved', meeting_date: '2026-01-01', body: 'm' }),
        row({ id: 'new', status: 'approved', meeting_date: '2026-09-01', body: 'm' }),
      ],
      opts,
    )
    expect(r.upcoming.map((m) => m.id)).toEqual(['a', 'b'])
    expect(r.past.map((m) => m.id)).toEqual(['new', 'old'])
  })

  it('projects only the shown fields, never board-only columns', () => {
    const leaky = {
      ...row({ id: 'p', status: 'approved', meeting_date: '2026-09-01', body: 'Minutes' }),
      raw_transcript: 'executive session',
      attendees: ['Board member'],
    } as ResidentMeetingRow
    const r = selectResidentMeetings([leaky], opts)
    expect(Object.keys(r.past[0]!).sort()).toEqual(['date', 'id', 'minutes', 'typeLabel'])
    expect(JSON.stringify(r)).not.toContain('executive')
  })
})

describe('agendaIsSafe', () => {
  it('uses the association day of the edit, not the UTC day', () => {
    // 9pm Eastern on Nov 4 is already Nov 5 in UTC.
    expect(agendaIsSafe({ meeting_date: '2026-11-05', updated_at: '2026-11-05T02:00:00Z' }, ET)).toBe(true)
    expect(agendaIsSafe({ meeting_date: '2026-11-05', updated_at: '2026-11-05T02:00:00Z' }, 'UTC')).toBe(false)
  })
})

describe('the column allowlist', () => {
  it('names no board-only column', () => {
    for (const c of ['raw_transcript', 'attendees', 'motions', 'action_items', 'ai_summary', 'notice_posted_at', '*']) {
      expect(RESIDENT_MEETING_COLUMNS.split(', ')).not.toContain(c)
    }
  })
})

describe('labels', () => {
  it('formats a calendar date without shifting it', () => {
    expect(formatMeetingDate('2026-11-05')).toBe('Thursday, November 5, 2026')
  })
  it('names each meeting type', () => {
    expect(meetingTypeLabel('annual')).toBe('Annual meeting')
    expect(meetingTypeLabel(null)).toBe('Board meeting')
    expect(meetingTypeLabel('weird')).toBe('Meeting')
  })
})
