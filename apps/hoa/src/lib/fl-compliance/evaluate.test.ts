import { describe, expect, it } from 'vitest'
import {
  checkQuote,
  complianceGate,
  daysAhead,
  evaluateMeetings,
  evaluateRecord,
  evaluateRecords,
  matchCategory,
  monthsBetween,
  officialStatuteText,
  summarizeRecords,
  type ComplianceDoc,
  type ComplianceMeeting,
} from './evaluate'
import { RECORD_CATEGORIES, type RecordCategory } from './rules'

const NOW = new Date('2026-10-16T15:00:00Z')

function cat(id: string): RecordCategory {
  const c = RECORD_CATEGORIES.find((x) => x.id === id)
  if (!c) throw new Error(`no category ${id}`)
  return c
}

let n = 0
function hoaDoc(type: string, title: string, date = '2026-06-01T00:00:00Z'): ComplianceDoc {
  return { source: 'hoa', id: `h${++n}`, title, type, date }
}
function govDoc(type: string, title: string, date = '2026-06-01'): ComplianceDoc {
  return { source: 'governing', id: `g${++n}`, title, type, date }
}

// ─── Category mapping ──────────────────────────────────────────────

describe('category mapping', () => {
  it('maps hoa_documents types', () => {
    expect(matchCategory(cat('declaration'), hoaDoc('ccr', 'Our CC&Rs'))).toBe('type')
    expect(matchCategory(cat('bylaws'), hoaDoc('bylaws', 'Untitled'))).toBe('type')
    expect(matchCategory(cat('rules'), hoaDoc('rules', 'Pool sheet'))).toBe('type')
  })

  it('maps governing_documents types', () => {
    expect(matchCategory(cat('declaration'), govDoc('declaration', 'Doc 1'))).toBe('type')
    expect(matchCategory(cat('bylaws'), govDoc('bylaws', 'Doc 2'))).toBe('type')
    expect(matchCategory(cat('rules'), govDoc('rules', 'Doc 3'))).toBe('type')
  })

  it('maps "other" / amendment / policy documents by title', () => {
    expect(matchCategory(cat('articles'), hoaDoc('other', 'Articles of Incorporation (1998)'))).toBe('title')
    expect(matchCategory(cat('bylaws'), govDoc('amendment', 'Second Amendment to the By-Laws'))).toBe('title')
    expect(matchCategory(cat('budget'), hoaDoc('other', '2026 Annual Budget'))).toBe('title')
    expect(matchCategory(cat('financial_report'), hoaDoc('other', 'FY2025 Financial Report'))).toBe('title')
    expect(matchCategory(cat('insurance'), hoaDoc('other', 'Insurance - D&O and GL'))).toBe('title')
    expect(matchCategory(cat('contracts'), hoaDoc('other', 'Current contracts and bids'))).toBe('title')
    expect(matchCategory(cat('director_certification'), hoaDoc('other', 'Director certification forms'))).toBe('title')
    expect(matchCategory(cat('conflict_of_interest'), govDoc('policy', 'Conflict of Interest Policy'))).toBe('title')
    expect(matchCategory(cat('retention_rules'), govDoc('policy', 'Records Retention Policy'))).toBe('title')
  })

  it('does not match unrelated documents', () => {
    expect(matchCategory(cat('articles'), hoaDoc('other', 'Newsletter articles'))).toBeNull()
    expect(matchCategory(cat('budget'), hoaDoc('ccr', 'Declaration'))).toBeNull()
    expect(matchCategory(cat('insurance'), govDoc('policy', 'Collection policy'))).toBeNull()
  })

  it('never treats statutes or minutes as association records', () => {
    expect(matchCategory(cat('rules'), govDoc('state_statute', 'Rules of the road'))).toBeNull()
    expect(matchCategory(cat('budget'), govDoc('minutes', 'Budget meeting minutes'))).toBeNull()
  })
})

// ─── Statuses + staleness ──────────────────────────────────────────

describe('record status', () => {
  it('missing when nothing matches', () => {
    expect(evaluateRecord(cat('articles'), [], NOW)).toMatchObject({ status: 'missing', matches: [] })
  })

  it('"none on file" (not missing) for conditional records', () => {
    expect(evaluateRecord(cat('director_contracts'), [], NOW).status).toBe('none_on_file')
    expect(evaluateRecord(cat('conflict_of_interest'), [], NOW).status).toBe('none_on_file')
  })

  it('present, newest match first', () => {
    const old = hoaDoc('bylaws', 'Bylaws 2001', '2001-01-01T00:00:00Z')
    const amended = govDoc('amendment', 'Bylaws amendment 2024', '2024-03-01')
    const line = evaluateRecord(cat('bylaws'), [old, amended], NOW)
    expect(line.status).toBe('present')
    expect(line.matches.map((m) => m.id)).toEqual([amended.id, old.id])
  })

  it('records that only change by amendment never go stale', () => {
    const line = evaluateRecord(cat('declaration'), [hoaDoc('ccr', 'CC&Rs', '1990-01-01T00:00:00Z')], NOW)
    expect(line.status).toBe('present')
  })

  it('a budget older than 13 months is stale; 13 months is not', () => {
    expect(evaluateRecord(cat('budget'), [hoaDoc('other', 'Budget', '2025-08-15T00:00:00Z')], NOW)).toMatchObject({
      status: 'stale',
      ageMonths: 14,
    })
    expect(evaluateRecord(cat('budget'), [hoaDoc('other', 'Budget', '2025-09-16T00:00:00Z')], NOW)).toMatchObject({
      status: 'present',
      ageMonths: 13,
    })
  })

  it('insurance older than 12 months is stale, unless a newer policy is on file', () => {
    const old = hoaDoc('other', 'Insurance 2024', '2024-09-01T00:00:00Z')
    expect(evaluateRecord(cat('insurance'), [old], NOW).status).toBe('stale')
    const renewed = hoaDoc('other', 'Insurance 2026', '2026-09-01T00:00:00Z')
    expect(evaluateRecord(cat('insurance'), [old, renewed], NOW).status).toBe('present')
  })

  it('a match with no date is present, not stale', () => {
    const d: ComplianceDoc = { source: 'governing', id: 'x', title: 'Budget', type: 'policy', date: null }
    expect(evaluateRecord(cat('budget'), [d], NOW)).toMatchObject({ status: 'present', ageMonths: null })
  })

  it('monthsBetween counts whole months and never goes negative', () => {
    expect(monthsBetween(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-28T00:00:00Z'))).toBe(0)
    expect(monthsBetween(new Date('2026-01-15T00:00:00Z'), new Date('2026-03-15T00:00:00Z'))).toBe(2)
    expect(monthsBetween(new Date('2027-01-01T00:00:00Z'), NOW)).toBe(0)
  })

  it('evaluates every category, and summarizes', () => {
    const docs = [
      hoaDoc('ccr', 'CC&Rs'),
      hoaDoc('bylaws', 'Bylaws'),
      hoaDoc('other', 'Budget 2024', '2024-01-01T00:00:00Z'),
    ]
    const lines = evaluateRecords(docs, NOW)
    expect(lines).toHaveLength(RECORD_CATEGORIES.length)
    expect(summarizeRecords(lines)).toEqual({
      present: 2,
      stale: 1,
      missing: RECORD_CATEGORIES.length - 3 - 2,
      noneOnFile: 2,
      postedForOwners: 0,
    })
  })
})

// ─── Posted for owners (BL-049) ────────────────────────────────────

describe('posted for owners', () => {
  const withFile = (d: ComplianceDoc, extra: Partial<ComplianceDoc> = {}): ComplianceDoc => ({ ...d, hasFile: true, ...extra })

  it('a resident-visible match with a file is posted, and links to the owner copy', () => {
    const d = withFile(hoaDoc('bylaws', 'Bylaws'))
    const line = evaluateRecord(cat('bylaws'), [d], NOW)
    expect(line.status).toBe('present')
    expect(line.posting).toBe('posted')
    expect(line.postedDoc?.id).toBe(d.id)
  })

  it('a title-matched "other" document is on file but not visible to owners', () => {
    const line = evaluateRecord(cat('budget'), [withFile(hoaDoc('other', '2026 Annual Budget'))], NOW)
    expect(line.status).toBe('present')
    expect(line.posting).toBe('not_visible')
    expect(line.postedDoc).toBeNull()
  })

  it('internal and draft types never count as posted', () => {
    for (const d of [
      withFile(hoaDoc('minutes', 'Rules committee minutes')),
      withFile(govDoc('minutes', 'Rules discussion')),
      withFile(govDoc('policy', 'Rules policy'), { aiGenerated: true }),
    ]) {
      const line = evaluateRecord(cat('rules'), [d], NOW)
      expect(line.posting, `${d.source} ${d.type}`).not.toBe('posted')
    }
  })

  it('a visible document with no stored file is not posted', () => {
    const line = evaluateRecord(cat('rules'), [govDoc('rules', 'Rules')], NOW)
    expect(line.posting).toBe('not_visible')
    const noFile = evaluateRecord(cat('rules'), [{ ...govDoc('rules', 'Rules'), hasFile: false }], NOW)
    expect(noFile.posting).toBe('not_visible')
  })

  it('when only an older match is visible, says the newest is not posted', () => {
    const older = withFile(hoaDoc('ccr', 'CC&Rs', '2020-01-01T00:00:00Z'))
    const newer = withFile(hoaDoc('other', 'Declaration amendment 2026', '2026-05-01T00:00:00Z'))
    const line = evaluateRecord(cat('declaration'), [older, newer], NOW)
    expect(line.matches[0].id).toBe(newer.id)
    expect(line.posting).toBe('older_posted')
    expect(line.postedDoc?.id).toBe(older.id)
  })

  it('no match → no posting status', () => {
    expect(evaluateRecord(cat('insurance'), [], NOW).posting).toBeNull()
  })

  it('the board view is unaffected: hidden documents still count as on file', () => {
    const docs = [withFile(hoaDoc('ccr', 'CC&Rs')), withFile(hoaDoc('other', 'Insurance policies 2026'))]
    const lines = evaluateRecords(docs, NOW)
    const insurance = lines.find((l) => l.category.id === 'insurance')
    expect(insurance?.status).toBe('present')
    expect(insurance?.matches).toHaveLength(1)
    expect(summarizeRecords(lines)).toMatchObject({ present: 2, postedForOwners: 1 })
  })
})

// ─── 14-day notice rule ────────────────────────────────────────────

function meeting(meetingDate: string, meetingType: string | null, addedAt: string | null): ComplianceMeeting {
  return { id: `m${++n}`, meetingDate, meetingType, addedAt }
}

describe('meeting notice timing', () => {
  it('counts calendar days from being added to the meeting', () => {
    expect(daysAhead(meeting('2026-11-01', 'annual', '2026-10-18T23:59:00Z'))).toBe(14)
    expect(daysAhead(meeting('2026-11-01', 'annual', null))).toBeNull()
  })

  it('an annual meeting added 13 days ahead is flagged; 14 days is not', () => {
    const [late] = evaluateMeetings([meeting('2026-10-29', 'annual', '2026-10-16T09:00:00Z')], NOW)
    expect(late).toMatchObject({ finding: 'added_late', daysAhead: 13, when: 'upcoming' })
    expect(late.rule.id).toBe('members_14')
    const [ok] = evaluateMeetings([meeting('2026-10-30', 'annual', '2026-10-16T09:00:00Z')], NOW)
    expect(ok).toMatchObject({ finding: 'not_recorded', daysAhead: 14 })
  })

  it('special (and unknown) meetings get the 14-day reading', () => {
    const [s] = evaluateMeetings([meeting('2026-10-20', 'special', '2026-10-10T00:00:00Z')], NOW)
    expect(s).toMatchObject({ finding: 'added_late', daysAhead: 10 })
    const [u] = evaluateMeetings([meeting('2026-10-20', null, '2026-10-10T00:00:00Z')], NOW)
    expect(u.rule.id).toBe('special_14')
    expect(u.finding).toBe('added_late')
  })

  it('a regular board meeting: under 48h is late, 2–13 days may be late', () => {
    const [a] = evaluateMeetings([meeting('2026-10-17', 'regular', '2026-10-16T00:00:00Z')], NOW)
    expect(a).toMatchObject({ finding: 'added_late', daysAhead: 1 })
    const [b] = evaluateMeetings([meeting('2026-10-26', 'regular', '2026-10-16T00:00:00Z')], NOW)
    expect(b).toMatchObject({ finding: 'maybe_late', daysAhead: 10 })
    const [c] = evaluateMeetings([meeting('2026-11-05', 'regular', '2026-10-01T00:00:00Z')], NOW)
    expect(c.finding).toBe('not_recorded')
  })

  it('emergency meetings are exempt', () => {
    const [e] = evaluateMeetings([meeting('2026-10-17', 'emergency', '2026-10-16T00:00:00Z')], NOW)
    expect(e.finding).toBe('exempt')
  })

  it('minutes recorded after the meeting say nothing about notice', () => {
    const [r] = evaluateMeetings([meeting('2026-10-01', 'annual', '2026-10-05T00:00:00Z')], NOW)
    expect(r).toMatchObject({ finding: 'added_after', when: 'recent' })
  })

  it('keeps only the window (30 days back, 90 ahead), upcoming soonest first then recent latest first', () => {
    const lines = evaluateMeetings(
      [
        meeting('2026-08-01', 'annual', '2026-07-01T00:00:00Z'), // too old
        meeting('2027-03-01', 'annual', '2026-10-01T00:00:00Z'), // too far
        meeting('2026-10-01', 'regular', '2026-09-01T00:00:00Z'),
        meeting('2026-10-10', 'regular', '2026-09-01T00:00:00Z'),
        meeting('2026-12-01', 'annual', '2026-10-01T00:00:00Z'),
        meeting('2026-10-16', 'regular', '2026-10-01T00:00:00Z'), // today counts as upcoming
      ],
      NOW,
    )
    expect(lines.map((l) => [l.meeting.meetingDate, l.when])).toEqual([
      ['2026-10-16', 'upcoming'],
      ['2026-12-01', 'upcoming'],
      ['2026-10-10', 'recent'],
      ['2026-10-01', 'recent'],
    ])
  })
})

// ─── State gate ────────────────────────────────────────────────────

describe('Florida-only gate', () => {
  it('only FL gets the check', () => {
    expect(complianceGate('FL')).toEqual({ kind: 'florida' })
    expect(complianceGate('GA')).toEqual({ kind: 'not_florida' })
    expect(complianceGate('CA')).toEqual({ kind: 'not_florida' })
    expect(complianceGate(null)).toEqual({ kind: 'not_florida' })
    expect(complianceGate(undefined)).toEqual({ kind: 'not_florida' })
  })
})

// ─── Statute text missing ──────────────────────────────────────────

describe('statute text not loaded', () => {
  const q = cat('rules').citation

  it('no stored row → not_loaded, and no quote is returned', () => {
    const text = officialStatuteText(null)
    expect(text).toBeNull()
    const check = checkQuote(q, text)
    expect(check).toEqual({ kind: 'not_loaded', subsection: '(4)(b)1.d' })
    expect('quote' in check).toBe(false)
  })

  it('a curated row (source_name NULL) is not official text → not_loaded', () => {
    expect(officialStatuteText({ body: 'The current rules of the association.', source_name: null })).toBeNull()
  })

  it('an empty official body → not_loaded', () => {
    expect(officialStatuteText({ body: '   ', source_name: 'flsenate.gov Fla. Stat. Ch. 720 (2026)' })).toBeNull()
  })

  it('official text that no longer contains the quote → mismatch, no quote', () => {
    const text = officialStatuteText({ body: '(4) OFFICIAL RECORDS.— amended wording', source_name: 'flsenate.gov' })
    expect(checkQuote(q, text)).toEqual({ kind: 'mismatch', subsection: '(4)(b)1.d' })
  })

  it('official text containing the quote → validated (whitespace and case tolerant only)', () => {
    const text = officialStatuteText({ body: 'd.  THE CURRENT RULES\nof the association.', source_name: 'flsenate.gov' })
    expect(checkQuote(q, text)).toMatchObject({ kind: 'validated', quote: q.quote })
  })
})
