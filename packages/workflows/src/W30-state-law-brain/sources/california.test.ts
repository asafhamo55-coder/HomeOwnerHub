import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CA_CATEGORY,
  californiaAdapter,
  camlToText,
  cleanHeading,
  parseSectionTable,
  parseTocTable,
  pubinfoUrl,
  sessionYearFor,
} from './california'
import { normalizeStatuteBody } from './normalize'
import { SourceUnavailableError } from './types'
import { ZIP_TAIL_BYTES } from './zip'
import { buildZip, fakeRangeGetter } from './zip-fixture'

/**
 * Real rows and section bodies from the Legislative Counsel's bulk database
 *   https://downloads.leginfo.legislature.ca.gov/pubinfo_2025.zip
 * read by range requests on 2026-10-20 (rows dated 2026-10-02):
 *   LAW_SECTION_TBL.dat — the rows for Civ. Code §§ 4000, 4040, 4200, 4900,
 *     5605, 5850, 5855, 6150, plus Penal Code § 4027.5 and Civ. Code § 3305
 *     (Division 4 but outside Part 5), which must be filtered out;
 *   LAW_TOC_TBL.dat — every Division 4 / Part 5 heading, plus one Civil Code
 *     heading from another division;
 *   lobs/ — the eight `.lob` section bodies, unmodified.
 * The tests pack them into an in-memory zip and serve it by byte range, so
 * the adapter's real read path (tail → central directory → tables → bodies)
 * runs with no network.
 */
const DIR = resolve(__dirname, '../../../../../scripts/fixtures/state-law/ca-pubinfo-2025')
const SECTION_TABLE = readFileSync(resolve(DIR, 'LAW_SECTION_TBL.dat'), 'utf8')
const TOC_TABLE = readFileSync(resolve(DIR, 'LAW_TOC_TBL.dat'), 'utf8')
const LOBS: Record<string, string> = Object.fromEntries(
  readdirSync(resolve(DIR, 'lobs')).map((n) => [n, readFileSync(resolve(DIR, 'lobs', n), 'utf8')]),
)

function archive(opts: { zip64?: boolean; omit?: string[] } = {}): Uint8Array {
  const files: Record<string, string> = {
    // First in the archive, so no other entry's read (each reaches a little
    // past its own data) can overlap it.
    'LAW_SECTION_TBL_1.lob': '<caml:Content><p>Penal Code text that must never be requested.</p></caml:Content>',
    'BILL_TBL.dat': 'unrelated table '.repeat(200),
    'LAW_SECTION_TBL.dat': SECTION_TABLE,
    'LAW_TOC_TBL.dat': TOC_TABLE,
    ...LOBS,
  }
  // Enough other entries that the central directory (~130 KB) lies outside
  // the 64 KB tail read, as in the real archive, and needs its own request.
  for (let i = 0; i < 1500; i++) files[`LAW_SECTION_TBL_${100000 + i}.lob`] = ''
  for (const n of opts.omit ?? []) delete files[n]
  return buildZip(files, { zip64: opts.zip64, padding: 4096 })
}

const NOW = () => new Date('2026-10-20T12:00:00Z')
const URL_2025 = pubinfoUrl(2025)

describe('parseSectionTable', () => {
  const rows = parseSectionTable(SECTION_TABLE)

  it('keeps live Civil Code Part 5 rows in §§ 4000–6150, ordered by section', () => {
    expect(rows.map((r) => r.sectionNumber)).toEqual(['4000', '4040', '4200', '4900', '5605', '5850', '5855', '6150'])
  })

  it('reads the effective date, chapter, article and body file', () => {
    expect(rows.find((r) => r.sectionNumber === '5855')).toEqual({
      sectionNumber: '5855',
      effectiveDate: '2025-06-30',
      chapter: '10',
      article: '1',
      lobName: 'LAW_SECTION_TBL_24672.lob',
    })
    // Chapter 2 has no articles.
    expect(rows.find((r) => r.sectionNumber === '4200')).toMatchObject({ chapter: '2', article: null })
  })

  it('drops inactive rows', () => {
    const inactive = SECTION_TABLE.split('\n')
      .map((l) => (l.includes('`CIV4000.') ? l.replace('\t`Y`\t', '\t`N`\t') : l))
      .join('\n')
    expect(parseSectionTable(inactive).map((r) => r.sectionNumber)).not.toContain('4000')
  })
})

describe('parseTocTable / cleanHeading', () => {
  const toc = parseTocTable(TOC_TABLE)

  it('maps (chapter, article) to the heading without its number or section range', () => {
    expect(toc.get('6.2')).toBe('Board Meeting')
    expect(toc.get('10.1')).toBe('Discipline and Cost Reimbursement')
    expect(toc.get('2')).toBe('Application of Act')
    expect(toc.get('6.4')).toBe('Member Election') // source has a doubled space
  })

  it('ignores headings outside Division 4, Part 5', () => {
    expect([...toc.values()]).not.toContain('Unlawful Transfers')
  })

  it('strips nested range brackets', () => {
    expect(cleanHeading('CHAPTER 5. Novation [1530. - [1533.]]')).toBe('Novation')
  })
})

describe('camlToText', () => {
  it('one line per <p>, EnSpace as a space, source line-wrapping collapsed', () => {
    const text = camlToText(LOBS['LAW_SECTION_TBL_16228.lob']) // § 4040
    const lines = text.split('\n')
    expect(lines[0]).toBe(
      '(a) (1) If a provision of this act requires an association to deliver a document by “individual delivery” or “individual notice,” the association shall deliver that document in accordance with the preferred delivery method specified by the member pursuant to Section 4041.',
    )
    // The source wraps "method of\n\t\t\t\t\t\tdelivery" inside one <p>.
    expect(text).toContain('does not constitute agreement by a member to that method of delivery.')
    expect(lines.at(-1)).toBe('(d) This section shall become operative on January 1, 2023.')
  })
})

describe('californiaAdapter (fixture archive served by byte range)', () => {
  it('reads Part 5 verbatim with a handful of range requests', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive() })
    const out = await californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()

    expect(out.sourceName).toBe('leginfo pubinfo_2025.zip Cal. Civ. Code §§ 4000–6150')
    expect(out.records.map((r) => r.code_citation)).toEqual([
      'Cal. Civ. Code § 4000',
      'Cal. Civ. Code § 4040',
      'Cal. Civ. Code § 4200',
      'Cal. Civ. Code § 4900',
      'Cal. Civ. Code § 5605',
      'Cal. Civ. Code § 5850',
      'Cal. Civ. Code § 5855',
      'Cal. Civ. Code § 6150',
    ])
    // tail, central directory, the two tables (one request), the bodies.
    expect(http.calls).toHaveLength(4)
    expect(http.calls[0].ranges).toEqual([{ suffix: ZIP_TAIL_BYTES }])
    expect(http.calls[2].ranges).toHaveLength(2)
    expect(http.calls[3].ranges).toHaveLength(8)
  })

  it('never requests the body of a section it does not ingest', async () => {
    const zip = archive()
    const http = fakeRangeGetter({ [URL_2025]: zip })
    await californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()
    const penalOffset = Buffer.from(zip).indexOf('LAW_SECTION_TBL_1.lob')
    for (const call of http.calls.slice(3)) {
      for (const r of call.ranges) {
        if ('start' in r) expect(r.start <= penalOffset && penalOffset <= r.end).toBe(false)
      }
    }
  })

  it('produces verbatim, canonical bodies with title, category, date and link', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive() })
    const { records } = await californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()
    const s5855 = records.find((r) => r.code_citation === 'Cal. Civ. Code § 5855')!
    expect(s5855).toMatchObject({
      title: 'Discipline and Cost Reimbursement',
      category: 'enforcement',
      effective_date: '2025-06-30',
      source_url: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=5855.',
    })
    // The same operative phrases BL-054 verified (docs/research/2026-10-ca-rules-verification.md).
    expect(s5855.body).toContain('at least 10 days prior to the meeting.')
    expect(s5855.body).toContain('\n\n(1) The member cures the violation prior to the meeting.\n\n')
    expect(s5855.body).toContain('within 14 days following the action.')

    expect(records.find((r) => r.code_citation === 'Cal. Civ. Code § 4900')).toMatchObject({
      title: 'Board Meeting',
      category: 'meetings',
      body: 'This article shall be known and may be cited as the Common Interest Development Open Meeting Act.',
    })
    expect(records.find((r) => r.code_citation === 'Cal. Civ. Code § 4200')!.title).toBe('Application of Act')
    expect(records.find((r) => r.code_citation === 'Cal. Civ. Code § 5605')!.category).toBe('dues')

    for (const r of records) {
      expect(normalizeStatuteBody(r.body)).toBe(r.body)
      expect(r.category).not.toBeNull()
    }
  })

  it('reads a ZIP64 archive (the real one has 205k entries)', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive({ zip64: true }) })
    const out = await californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()
    expect(out.records).toHaveLength(8)
  })

  it('falls back to the previous session archive when this one is not published', async () => {
    const http = fakeRangeGetter({ [pubinfoUrl(2025)]: archive() })
    const out = await californiaAdapter({
      http,
      now: () => new Date('2027-01-04T00:00:00Z'),
      minSections: 8,
    }).fetchSections()
    expect(http.calls[0].url).toBe(pubinfoUrl(2027))
    expect(out.sourceName).toContain('pubinfo_2025.zip')
  })

  it('refuses a short set rather than return it (a short list would read as mass repeal)', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive() })
    // The production minimum (200) against the 8-section fixture.
    await expect(californiaAdapter({ http, now: NOW }).fetchSections()).rejects.toBeInstanceOf(SourceUnavailableError)
  })

  it('fails when a section body is missing from the archive', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive({ omit: ['LAW_SECTION_TBL_24672.lob'] }) })
    await expect(californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()).rejects.toThrow(
      /LAW_SECTION_TBL_24672\.lob/,
    )
  })

  // The archive is rebuilt weekly. Offsets read from one build point at
  // garbage in the next, so a mid-run rebuild must fail the run.
  it('fails if the archive is replaced between requests (ETag changes)', async () => {
    const http = fakeRangeGetter({ [URL_2025]: archive() }, { etag: (_u, i) => (i < 2 ? '"build-1"' : '"build-2"') })
    await expect(californiaAdapter({ http, now: NOW, minSections: 8 }).fetchSections()).rejects.toThrow(
      /changed during the run/,
    )
  })

  it('covers Davis-Stirling citations only', () => {
    const a = californiaAdapter({ http: fakeRangeGetter({}) })
    expect(a.covers('Cal. Civ. Code § 4000')).toBe(true)
    expect(a.covers('Cal. Civ. Code § 5300.5')).toBe(true)
    expect(a.covers('Cal. Civ. Code § 6150')).toBe(true)
    expect(a.covers('Cal. Civ. Code § 1950.5')).toBe(false)
    expect(a.covers('Cal. Civ. Code § 6151')).toBe(false)
    expect(a.covers('Fla. Stat. § 720.303')).toBe(false)
  })

  it('category vocabulary is the shared one', () => {
    const vocabulary = new Set(['governance', 'meetings', 'records', 'dues', 'enforcement'])
    for (const v of Object.values(CA_CATEGORY)) expect(vocabulary.has(v)).toBe(true)
  })
})

describe('sessionYearFor', () => {
  it('maps a year to the session that started in the odd year', () => {
    expect(sessionYearFor(new Date('2026-10-20T00:00:00Z'))).toBe(2025)
    expect(sessionYearFor(new Date('2027-01-01T00:00:00Z'))).toBe(2027)
  })
})
