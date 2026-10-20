import { describe, expect, it } from 'vitest'
import {
  collectMotions,
  extractMover,
  extractSeconder,
  extractVotes,
  filterMotions,
  motionCsvRow,
  motionsForMeeting,
  motionsFromText,
  normalizeResult,
  parseMotionFilters,
  structuredMotions,
  type MinutesRow,
} from './meeting-motions'

const MINUTES = `HOA Board Meeting Minutes

1. Attendees
- Pat Lee, Sam Ortiz, Dana Kim

2. Topics Discussed
- Pool resurfacing quotes reviewed
- Owners asked about the motion-sensor lights at the gate

3. Decisions Made
- Approved the 2027 operating budget (5-0)
- Motion to replace the north fence, moved by Pat Lee, seconded by Sam Ortiz; failed 2-3
- Landscaping contract renewal tabled until November
- None

4. Action Items
- Dana Kim — collect fence bids — Nov 1

5. Next Meeting
November 12`

function row(over: Partial<MinutesRow> = {}): MinutesRow {
  return {
    id: 'm1',
    meeting_date: '2026-10-03',
    meeting_type: 'regular',
    status: 'approved',
    motions: [],
    ai_summary: MINUTES,
    ...over,
  }
}

describe('normalizeResult', () => {
  it('reads negatives before positives', () => {
    expect(normalizeResult('did not pass')).toBe('failed')
    expect(normalizeResult('Carried unanimously')).toBe('passed')
    expect(normalizeResult('Tabled')).toBe('tabled')
    expect(normalizeResult('withdrawn by mover')).toBe('withdrawn')
    expect(normalizeResult('discussed')).toBeNull()
    expect(normalizeResult(3)).toBeNull()
  })
})

describe('motionsFromText', () => {
  it('reads the Decisions section bullets and nothing under other headings', () => {
    const m = motionsFromText(MINUTES)
    expect(m.map((x) => x.text)).toEqual([
      'Approved the 2027 operating budget (5-0)',
      'Motion to replace the north fence, moved by Pat Lee, seconded by Sam Ortiz; failed 2-3',
      'Landscaping contract renewal tabled until November',
    ])
    expect(m[0]).toMatchObject({ result: 'passed', votes: { yea: 5, nay: 0, abstain: null } })
    expect(m[1]).toMatchObject({ movedBy: 'Pat Lee', secondedBy: 'Sam Ortiz', result: 'failed' })
    expect(m[2]).toMatchObject({ result: 'tabled', votes: null })
  })

  it('does not mistake a mention of "motion" for a motion', () => {
    expect(motionsFromText('- Owners asked about the motion-sensor lights')).toEqual([])
  })

  it('finds an explicit motion outside any decisions heading', () => {
    const m = motionsFromText('Sam Ortiz moved to adopt the parking policy. Dana Kim seconded. Motion carried 4-1.')
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ movedBy: 'Sam Ortiz', secondedBy: 'Dana Kim', result: 'passed' })
  })

  it('handles empty input', () => {
    expect(motionsFromText(null)).toEqual([])
    expect(motionsFromText('')).toEqual([])
  })
})

describe('extractors', () => {
  it('does not take a sentence opener as a name', () => {
    expect(extractSeconder('Motion seconded and carried')).toBeNull()
    expect(extractMover('The Board moved to adjourn')).toBeNull()
  })
  it('reads tallies in words', () => {
    expect(extractVotes('4 in favor, 1 opposed, 1 abstained')).toEqual({ yea: 4, nay: 1, abstain: 1 })
    expect(extractVotes('meeting on 2026-10-03')).toBeNull()
  })
})

describe('structuredMotions', () => {
  it('tolerates old shapes', () => {
    const m = structuredMotions([
      { text: 'Adopt budget', yea: 5, nay: 0, result: 'passed', moved_by: 'Pat' },
      { motion: 'Replace fence', votes: { for: 2, against: 3 }, outcome: 'Failed' },
      'Ratify minutes — approved',
      { nothing: true },
      null,
      42,
    ])
    expect(m).toHaveLength(3)
    expect(m[0]).toMatchObject({ text: 'Adopt budget', movedBy: 'Pat', result: 'passed', votes: { yea: 5, nay: 0, abstain: null } })
    expect(m[1]).toMatchObject({ text: 'Replace fence', result: 'failed', votes: { yea: 2, nay: 3 } })
    expect(m[2]).toMatchObject({ result: 'passed' })
    expect(structuredMotions('nope')).toEqual([])
    expect(structuredMotions(null)).toEqual([])
  })
})

describe('motionsForMeeting', () => {
  it('prefers structured motions and labels the source', () => {
    const s = motionsForMeeting(row({ motions: [{ text: 'Adopt budget', result: 'passed' }] }))
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ source: 'structured', id: 'm1:0', meetingId: 'm1' })
    const t = motionsForMeeting(row())
    expect(t).toHaveLength(3)
    expect(t.every((x) => x.source === 'minutes_text')).toBe(true)
  })

  it('skips upcoming meetings (their text is an agenda) and sorts newest first', () => {
    const all = collectMotions(
      [
        row({ id: 'old', meeting_date: '2025-06-01' }),
        row({ id: 'future', meeting_date: '2026-12-01' }),
        row({ id: 'new', meeting_date: '2026-10-03' }),
      ],
      '2026-10-20',
    )
    expect([...new Set(all.map((m) => m.meetingId))]).toEqual(['new', 'old'])
  })
})

describe('filters and CSV', () => {
  const all = collectMotions([row(), row({ id: 'm0', meeting_date: '2025-04-04' })], '2026-10-20')

  it('parses filters defensively', () => {
    expect(parseMotionFilters({ q: '  fence ', year: '26', result: 'bogus' })).toEqual({ q: 'fence', year: null, result: null })
    expect(parseMotionFilters({ year: '2026', result: 'none' })).toEqual({ q: null, year: '2026', result: 'none' })
  })

  it('filters by text, mover, year and result', () => {
    expect(filterMotions(all, { q: 'FENCE', year: null, result: null })).toHaveLength(2)
    expect(filterMotions(all, { q: 'ortiz', year: '2026', result: null })).toHaveLength(1)
    expect(filterMotions(all, { q: null, year: null, result: 'passed' })).toHaveLength(2)
  })

  it('writes one CSV row per motion with a link to the minutes', () => {
    const r = motionCsvRow(all[1]!)
    expect(r[0]).toBe('2026-10-03')
    expect(r[1]).toBe('Regular meeting')
    expect(r[4]).toBe('Pat Lee')
    expect(r[6]).toBe('Failed')
    expect(r[10]).toBe('From minutes text')
    expect(r[11]).toBe('/meetings/m1')
  })
})
