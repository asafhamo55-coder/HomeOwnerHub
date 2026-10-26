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
  GA_RECORDS_ACCOUNTING,
  GA_RECORDS_ARTICLES,
  GA_RECORDS_BOARD_MINUTES,
  GA_RECORDS_BYLAWS,
  GA_RECORDS_CATEGORIES,
  GA_RECORDS_CITATIONS,
  GA_RECORDS_COMMUNICATIONS,
  GA_RECORDS_MEMBER_MINUTES,
  GA_RECORDS_MEMBERSHIP_LIST,
  GA_RECORDS_NOTICE_BUSINESS_DAYS,
  GA_RECORDS_ON_NOTICE,
  GA_RECORDS_PARTICULARITY,
  GA_RECORDS_WITH_PURPOSE,
  GA_2027_ACCOUNTING_SENTENCE,
  GA_2027_INSURANCE,
  GA_2027_RECORDS,
  GA_2027_RECORDS_CITATIONS,
  GA_2027_RECORDS_FROM,
  GA_PROPER_PURPOSE_ASK_ATTORNEY,
  GA_PROPOSED_RULES_CONFIRM,
  RECORDS_KINDS,
  RECORDS_KIND_VALUES,
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

  it('Georgia § 14-3-1602: every quote, word for word, inside that section', () => {
    const t = fixture('ga-ocga-14-3-2026.txt')
    const start = t.indexOf('=== O.C.G.A. Section 14-3-1602 |')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = t.indexOf('\n=== ', start + 1)
    const s = norm(t.slice(start, end === -1 ? undefined : end))
    for (const c of GA_RECORDS_CITATIONS) {
      expect(c.cite.startsWith('O.C.G.A. § 14-3-1602')).toBe(true)
      expect(s).toContain(norm(c.quote))
    }
    expect(new Set(GA_RECORDS_CITATIONS.map((c) => c.quote)).size).toBe(GA_RECORDS_CITATIONS.length)
    // Everything the Georgia branch and the categories panel can show is in the checked list.
    const shown = [
      ...['governing', 'minutes', 'financial', 'owner_list', 'contracts', 'insurance_certificate', 'other'].flatMap(
        (k) => recordsDeadline({ state: 'GA', kind: k as never, period: 'current', receivedDay: '2026-10-20' }).citations,
      ),
      GA_RECORDS_CATEGORIES.onNotice.rule,
      ...GA_RECORDS_CATEGORIES.onNotice.records,
      GA_RECORDS_CATEGORIES.withPurpose.rule,
      ...GA_RECORDS_CATEGORIES.withPurpose.records,
      ...GA_RECORDS_CATEGORIES.withPurpose.conditions,
      GA_RECORDS_CATEGORIES.withPurpose.restrictions,
    ]
    for (const c of shown) expect(GA_RECORDS_CITATIONS).toContain(c)
  })

  it('Georgia 2027: § 43-17A-7(1) and (2), word for word, inside § 43-17A-7 of the SB 406 text', () => {
    const t = fixture('ga-sb406-2026-2027-text.txt')
    const start = t.indexOf('\n43-17A-7.\n')
    const end = t.indexOf('\n43-17A-8.\n')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const s = t.slice(start, end)
    expect(GA_2027_RECORDS_CITATIONS).toEqual([GA_2027_RECORDS, GA_2027_INSURANCE])
    expect(s).toContain(`(1) ${GA_2027_RECORDS.quote}`)
    expect(s).toContain(`(2) ${GA_2027_INSURANCE.quote}`)
    expect(GA_2027_RECORDS.quote.endsWith(` ${GA_2027_ACCOUNTING_SENTENCE}`)).toBe(true)
    expect(GA_2027_RECORDS.cite).toBe('O.C.G.A. § 43-17A-7(1)')
    expect(GA_2027_INSURANCE.cite).toBe('O.C.G.A. § 43-17A-7(2)')
    // It sets no day count, so no date is ever taken from it.
    expect(s).not.toMatch(/business days|within \d+ days/i)
    expect(t).toContain('this Act shall become effective on January 1, 2027.')
    expect(GA_2027_RECORDS_FROM).toBe('2027-01-01')
    // The proposed 590-13 rules are not loaded: no number from them is shown.
    expect(GA_PROPOSED_RULES_CONFIRM).not.toMatch(/\d+ (business )?days/)
  })

  it('Georgia: the five business days in the code match the words', () => {
    expect(GA_RECORDS_NOTICE_BUSINESS_DAYS).toBe(5)
    expect(GA_RECORDS_ON_NOTICE.quote).toContain('at least five business days before the date')
    expect(GA_RECORDS_WITH_PURPOSE.quote).toContain('at least five business days before the date')
    expect(GA_RECORDS_PARTICULARITY.quote).toContain('with reasonable particularity')
  })

  it('TX § 209.005, CA § 4950 and Corp. Code § 8330 are NOT loaded; GA Art. 6 sets no production deadline', () => {
    expect(fixture('tx-prop-209-2026.txt')).not.toMatch(/Sec\. 209\.005\./)
    expect(fixture('tcss-pr209-2026-excerpt.htm')).not.toMatch(/Sec\. 209\.005\./)
    expect(fixture('ca-civ-davis-stirling-2026.txt')).not.toContain('=== Civ. Code § 4950.')
    expect(fixture('ca-civ-davis-stirling-2026.txt')).not.toContain('=== Corp')
    expect(fixture('ga-ocga-14-3-2026.txt')).not.toContain('=== O.C.G.A. Section 14-3-1605 |')
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

  it('TX, unknown and other states: check your bylaws, no citation', () => {
    for (const s of ['TX', 'NY', null, 'Florida', 'Georgia']) {
      expect(deadline(s, 'financial')).toEqual({ dueDate: null, message: CHECK_BYLAWS, citations: [] })
    }
  })

  it('GA: five business days after the notice for named records; (c) records carry the purpose rules', () => {
    // Tue 2026-10-20 + 5 business days = Tue 2026-10-27
    for (const kind of ['governing', 'minutes', 'financial', 'owner_list'] as const) {
      expect(deadline('ga', kind).dueDate).toBe('2026-10-27')
      expect(deadline('GA', kind).message).toContain('Georgia nonprofit corporation')
    }
    expect(deadline('GA', 'governing').citations).toEqual([GA_RECORDS_ON_NOTICE, GA_RECORDS_ARTICLES, GA_RECORDS_BYLAWS])
    expect(deadline('GA', 'governing').citations).not.toContain(GA_RECORDS_PARTICULARITY)
    expect(deadline('GA', 'minutes').citations).toEqual(expect.arrayContaining([GA_RECORDS_MEMBER_MINUTES, GA_RECORDS_BOARD_MINUTES, GA_RECORDS_PARTICULARITY]))
    expect(deadline('GA', 'financial').citations).toEqual(expect.arrayContaining([GA_RECORDS_COMMUNICATIONS, GA_RECORDS_ACCOUNTING, GA_RECORDS_PARTICULARITY]))
    expect(deadline('GA', 'owner_list').citations).toEqual(expect.arrayContaining([GA_RECORDS_MEMBERSHIP_LIST, GA_RECORDS_PARTICULARITY]))
    expect(deadline('GA', 'owner_list').citations).not.toContain(GA_RECORDS_ON_NOTICE)
    // Friday received: the following Friday.
    expect(recordsDeadline({ state: 'GA', kind: 'governing', period: 'current', receivedDay: '2026-10-23' }).dueDate).toBe('2026-10-30')
  })

  it('GA: contracts and other records are not named, so no date', () => {
    for (const kind of ['contracts', 'other', null] as const) {
      const d = deadline('GA', kind)
      expect(d.dueDate).toBeNull()
      expect(d.citations).toEqual([GA_RECORDS_ON_NOTICE, GA_RECORDS_WITH_PURPOSE])
    }
  })

  it('GA before 2027: the insurance certificate is not named in § 14-3-1602, so no date; the 2027 right is mentioned, not cited', () => {
    const d = deadline('GA', 'insurance_certificate')
    expect(d.dueDate).toBeNull()
    expect(d.citations).toEqual([GA_RECORDS_ON_NOTICE, GA_RECORDS_WITH_PURPOSE])
    expect(d.message).toContain('From Jan 1, 2027')
    expect(d.message).toContain('Georgia nonprofit corporation')
  })

  it('GA before 2027 is unchanged: nothing cites § 43-17A-7 on Dec 31, 2026', () => {
    for (const kind of RECORDS_KIND_VALUES) {
      const d = recordsDeadline({ state: 'GA', kind, period: 'current', receivedDay: '2026-12-31' })
      expect(d.citations).not.toContain(GA_2027_RECORDS)
      expect(d.citations).not.toContain(GA_2027_INSURANCE)
      expect(d.message).not.toContain(GA_PROPOSED_RULES_CONFIRM)
    }
  })

  it('GA from 2027: § 43-17A-7(1) alongside § 14-3-1602 for every kind, the Nonprofit Code date kept, 590-13 a Confirm item only', () => {
    const on = (kind: (typeof RECORDS_KIND_VALUES)[number]) =>
      recordsDeadline({ state: 'GA', kind, period: 'current', receivedDay: '2027-01-04' })
    for (const kind of ['governing', 'minutes', 'financial', 'owner_list'] as const) {
      const d = on(kind)
      expect(d.dueDate).toBe('2027-01-11')
      expect(d.citations[0]).toBe(GA_2027_RECORDS)
      expect(d.citations.slice(1)).toEqual(recordsDeadline({ state: 'GA', kind, period: 'current', receivedDay: '2026-10-20' }).citations)
      expect(d.message).toContain('whether or not the association is incorporated')
      expect(d.message).toContain(GA_PROPOSED_RULES_CONFIRM)
    }
    expect(on('financial').message).toContain('3-year financial packet')
    expect(on('financial').message).toContain(GA_PROPER_PURPOSE_ASK_ATTORNEY)
    expect(on('governing').message).not.toContain(GA_PROPER_PURPOSE_ASK_ATTORNEY)
    expect(on('contracts').dueDate).toBeNull()
    expect(on('contracts').citations[0]).toBe(GA_2027_RECORDS)
  })

  it('GA from 2027: the insurance certificate cites § 43-17A-7(2) only, with no date', () => {
    const d = recordsDeadline({ state: 'GA', kind: 'insurance_certificate', period: 'current', receivedDay: '2027-01-01' })
    expect(d).toMatchObject({ dueDate: null, citations: [GA_2027_INSURANCE] })
    expect(d.message).toContain('sets no number of days')
  })

  it('the insurance certificate is a form choice and round-trips', () => {
    expect(RECORDS_KINDS.map((k) => k.value)).toEqual([...RECORDS_KIND_VALUES].sort((a, b) =>
      RECORDS_KINDS.findIndex((k) => k.value === a) - RECORDS_KINDS.findIndex((k) => k.value === b),
    ))
    expect(new Set(RECORDS_KINDS.map((k) => k.value))).toEqual(new Set(RECORDS_KIND_VALUES))
    const { subject, description } = composeRecordsRequest({ kind: 'insurance_certificate', period: 'current', format: 'electronic', details: 'For my HO-6 agent.' })
    expect(subject).toBe('Records request: Insurance certificate')
    expect(parseRecordsRequest(description).kind).toBe('insurance_certificate')
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
