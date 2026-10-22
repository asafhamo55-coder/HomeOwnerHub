import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_RECORDS_CITATIONS,
  CA_RECORDS_CURRENT,
  CA_RECORDS_INTRO,
  CA_RECORDS_MEMBERSHIP,
  CA_RECORDS_MINUTES,
  CA_RECORDS_PRIOR,
  CHECK_BYLAWS,
  FL_RECORDS_ACCESS,
  FL_RECORDS_DAMAGES,
  addBusinessDays,
  composeRecordsRequest,
  dueDayOf,
  dueInstant,
  parseRecordsRequest,
  recordsChip,
  recordsDeadline,
  recordsDigestCounts,
} from './law'

/**
 * Every quote in law.ts must be in the statute text the repo keeps
 * (scripts/fixtures/state-law), word for word. And the sections the module
 * says are NOT loaded must really be absent, so "check your bylaws" stays
 * honest.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => norm(fl.find((r) => r.code_citation === cite)?.body ?? '')
const caSection = (n: string) => {
  const t = fixture('ca-civ-davis-stirling-2026.txt')
  const start = t.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = t.indexOf('\n=== ', start + 1)
  return norm(t.slice(start, end === -1 ? undefined : end))
}

describe('citations are verbatim from the fixtures', () => {
  it('Florida § 720.303(5)(a) and (c)', () => {
    const s = flSection('Fla. Stat. § 720.303')
    expect(s).toContain('(5) INSPECTION AND COPYING OF RECORDS.')
    for (const c of [FL_RECORDS_ACCESS, FL_RECORDS_DAMAGES]) expect(s).toContain(c.quote)
  })

  it('California § 5210(b), (b)(1), (b)(2), (b)(4), (b)(6)', () => {
    const s = caSection('5210')
    for (const c of [CA_RECORDS_INTRO, CA_RECORDS_CURRENT, CA_RECORDS_PRIOR, CA_RECORDS_MINUTES, CA_RECORDS_MEMBERSHIP]) {
      expect(s).toContain(c.quote)
    }
  })

  it('every exported citation is covered above', () => {
    expect(ALL_RECORDS_CITATIONS).toHaveLength(7)
  })

  it('TX § 209.005, CA § 4950 and Corp. Code § 8330 are NOT loaded, and GA sets no production deadline', () => {
    expect(fixture('tx-prop-209-2026.txt')).not.toMatch(/Sec\. 209\.005\./)
    expect(fixture('tcss-pr209-2026-excerpt.htm')).not.toMatch(/Sec\. 209\.005\./)
    expect(fixture('ca-civ-davis-stirling-2026.txt')).not.toContain('=== Civ. Code § 4950.')
    expect(fixture('ca-civ-davis-stirling-2026.txt')).not.toContain('=== Corp')
    const all = fixture('ga-ocga-44-3-art6-2026.txt')
    // The text in force before 2027: everything before the dated 2027 records (BL-154).
    const ga = all.slice(0, all.lastIndexOf('=== O.C.G.A. Section 44-3-222 |'))
    expect(ga).toContain('the association shall keep:')
    // Its only "business days" deadline is the § 44-3-232 statement of
    // amounts due, not records; nothing grants inspection or copying.
    expect(ga).not.toMatch(/inspect|examin|photocop/i)
    // From 2027-01-01, SB 406 § 2 (§ 43-17A-7(1)) gives owners a right to
    // inspect and copy records, but still sets no time to produce them, so
    // "check your bylaws" stays right for the deadline.
    const ch17A = all.slice(all.indexOf('=== Ga. L. 2026, SB 406, § 2 |'))
    expect(ch17A).toContain('@effective_date: 2027-01-01')
    expect(ch17A).toContain('(1) Inspect and obtain copies of owners’ association records, accounting records, and other records of the owners’ association upon written demand')
    expect(ch17A).not.toMatch(/business days|within \d+ days of (the )?(receipt|demand|request)/i)
  })
})

describe('addBusinessDays', () => {
  it('skips weekends and does not count the start day', () => {
    // Tue 2026-10-20 + 10 business days = Tue 2026-11-03
    expect(addBusinessDays('2026-10-20', 10)).toBe('2026-11-03')
    // Fri + 1 = Mon
    expect(addBusinessDays('2026-10-23', 1)).toBe('2026-10-26')
    // Saturday received: Mon is day 1
    expect(addBusinessDays('2026-10-24', 1)).toBe('2026-10-26')
    expect(addBusinessDays('bad', 1)).toBeNull()
  })
})

const deadline = (state: string | null, kind: Parameters<typeof recordsDeadline>[0]['kind'], period: Parameters<typeof recordsDeadline>[0]['period'] = 'current') =>
  recordsDeadline({ state, kind, period, receivedDay: '2026-10-20' })

describe('recordsDeadline', () => {
  it('FL: 10 business days, any record, with the damages note', () => {
    for (const kind of ['owner_list', 'financial', 'minutes'] as const) {
      const d = deadline('fl', kind)
      expect(d.dueDate).toBe('2026-11-03')
      expect(d.citations).toEqual([FL_RECORDS_ACCESS, FL_RECORDS_DAMAGES])
    }
  })

  it('CA: current year 10 business days, prior years 30 calendar days, both = the earlier', () => {
    expect(deadline('CA', 'financial', 'current').dueDate).toBe('2026-11-03')
    expect(deadline('CA', 'financial', 'prior').dueDate).toBe('2026-11-19')
    const both = deadline('CA', 'financial', 'both')
    expect(both.dueDate).toBe('2026-11-03')
    expect(both.citations).toContain(CA_RECORDS_PRIOR)
  })

  it('CA: owner list and minutes point at unloaded sections, so no date', () => {
    expect(deadline('CA', 'owner_list').dueDate).toBeNull()
    expect(deadline('CA', 'owner_list').citations).toContain(CA_RECORDS_MEMBERSHIP)
    expect(deadline('CA', 'minutes').dueDate).toBeNull()
    expect(deadline('CA', 'minutes').citations).toContain(CA_RECORDS_MINUTES)
  })

  it('TX, GA, unknown and other states: check your bylaws, no citation', () => {
    for (const s of ['TX', 'GA', 'NY', null, 'Florida']) {
      expect(deadline(s, 'financial')).toEqual({ dueDate: null, message: CHECK_BYLAWS, citations: [] })
    }
  })

  it('an unreadable received day is "check your bylaws"', () => {
    expect(recordsDeadline({ state: 'FL', kind: 'financial', period: 'current', receivedDay: 'x' }).dueDate).toBeNull()
  })
})

describe('storage round trip', () => {
  it('dueInstant / dueDayOf keep the day, including the Postgres +00:00 form', () => {
    expect(dueDayOf(dueInstant('2026-11-03'))).toBe('2026-11-03')
    expect(dueDayOf('2026-11-03T17:00:00+00:00')).toBe('2026-11-03')
    expect(dueDayOf(null)).toBeNull()
    expect(dueDayOf('nope')).toBeNull()
  })

  it('compose / parse round trip', () => {
    const { subject, description } = composeRecordsRequest({
      kind: 'owner_list',
      period: 'both',
      format: 'electronic',
      details: '  For the annual meeting.  ',
    })
    expect(subject).toBe('Records request: Owner list')
    expect(description.endsWith('For the annual meeting.')).toBe(true)
    expect(parseRecordsRequest(description)).toEqual({ kind: 'owner_list', period: 'both', format: 'electronic' })
    expect(parseRecordsRequest('free text')).toEqual({ kind: null, period: null, format: null })
  })
})

describe('recordsChip and digest counts', () => {
  const today = '2026-10-20'
  it('red when overdue, amber within 3 days, neutral later', () => {
    expect(recordsChip({ dueDate: '2026-10-19', today, closed: false })).toMatchObject({ chip: 'overdue', label: 'Overdue by 1 day' })
    expect(recordsChip({ dueDate: '2026-10-20', today, closed: false })).toMatchObject({ chip: 'due_soon', label: 'Due today' })
    expect(recordsChip({ dueDate: '2026-10-23', today, closed: false }).chip).toBe('due_soon')
    expect(recordsChip({ dueDate: '2026-10-24', today, closed: false }).chip).toBe('on_track')
    expect(recordsChip({ dueDate: null, today, closed: false }).chip).toBe('none')
    expect(recordsChip({ dueDate: '2026-10-01', today, closed: true }).chip).toBe('done')
  })

  it('counts only open requests with a date', () => {
    expect(
      recordsDigestCounts(
        [
          { records_due_at: dueInstant('2026-10-10'), status: 'open' },
          { records_due_at: dueInstant('2026-10-21'), status: 'in_progress' },
          { records_due_at: dueInstant('2026-10-10'), status: 'closed' },
          { records_due_at: null, status: 'open' },
          { records_due_at: dueInstant('2026-12-01'), status: 'open' },
        ],
        today,
      ),
    ).toEqual({ overdue: 1, dueSoon: 1 })
  })
})
