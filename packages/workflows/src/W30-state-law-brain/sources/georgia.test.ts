import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planStatuteSync, type ExistingStatuteRow } from '../plan'
import { GA_SNAPSHOT } from './georgia-snapshot.generated'
import { GA_CATEGORY, GA_MIN_SECTIONS, georgiaAdapter, georgiaCovers, parseGeorgiaSnapshot } from './georgia'
import { adapterFor, SOURCE_STATES } from './index'
import { normalizeStatuteBody, statuteContentHash } from './normalize'
import { SourceUnavailableError } from './types'

/**
 * The vetted snapshot itself (public statute text; provenance in its header).
 * No network: GA is an offline adapter.
 */
const FIXTURE = readFileSync(
  resolve(__dirname, '../../../../../scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt'),
  'utf8',
)
/** The earlier, independently sourced § 44-3-232(d) reproductions (two bills). */
const GA_232_D = readFileSync(
  resolve(__dirname, '../../../../../scripts/fixtures/state-law/ga-ocga-44-3-232-2026.txt'),
  'utf8',
)

const BEFORE_EXPIRY = () => new Date('2026-10-20T12:00:00Z')

const ART6 = [
  '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
  '230', '231', '232', '232.1', '233', '234', '235',
].map((n) => `O.C.G.A. Section 44-3-${n}`)

describe('parseGeorgiaSnapshot (committed GA snapshot)', () => {
  const snap = parseGeorgiaSnapshot(FIXTURE)
  const byCite = new Map(snap.records.map((r) => [r.code_citation, r]))

  it('carries every section of Art. 6, in order, plus SB 406 § 7 — 18 records', () => {
    expect(snap.records.map((r) => r.code_citation)).toEqual([...ART6, 'Ga. L. 2026, SB 406, § 7'])
    expect(GA_MIN_SECTIONS).toBe(17)
  })

  it('reads the snapshot metadata', () => {
    expect(snap.sourceName).toMatch(/^O\.C\.G\.A\. Title 44 Ch\. 3 Art\. 6 \(State release 86/)
    expect(snap.retrieved).toBe('2026-10-20')
    expect(snap.validUntil).toBe('2027-01-01')
  })

  it('every record has a title, a category, an https source and a normalised body', () => {
    for (const r of snap.records) {
      expect(r.title.length).toBeGreaterThan(3)
      expect(r.category).toBe(GA_CATEGORY[r.code_citation])
      expect(r.source_url).toMatch(/^https:\/\//)
      expect(r.body).toBe(normalizeStatuteBody(r.body))
      expect(georgiaCovers(r.code_citation)).toBe(true)
    }
  })

  it('keeps one paragraph per subsection and drops History and annotations', () => {
    const defs = byCite.get('O.C.G.A. Section 44-3-221')!
    expect(defs.title).toBe('Definitions')
    expect(defs.body.split('\n\n')).toHaveLength(19) // lead-in + paragraphs (1)–(18)
    expect(defs.body).toContain('(10) “Lot owner” means one or more persons who are record title owners of a lot.')
    for (const r of snap.records) {
      expect(r.body).not.toMatch(/Ga\. L\. 1994|JUDICIAL DECISIONS|Code 1981/)
    }
    expect(byCite.get('O.C.G.A. Section 44-3-220')!.body).toBe(
      'This article shall be known and may be cited as the “Georgia Property Owners’ Association Act.”',
    )
  })

  it('§ 44-3-232(d) matches the two bill reproductions recorded independently in ga-ocga-44-3-232-2026.txt', () => {
    const fromBill = GA_232_D.split('=== HB 512 (2025) reproduction of § 44-3-232(d)\n')[1].split('\n')[0]
    const d = byCite.get('O.C.G.A. Section 44-3-232')!.body.split('\n\n').find((p) => p.startsWith('(d) '))!
    const plain = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    expect(plain(d)).toBe(plain(fromBill))
  })

  it('applies HB 220 (2024): § 44-3-223 notice before injunction, § 44-3-230(b), § 44-3-231(a)(4)', () => {
    const s223 = byCite.get('O.C.G.A. Section 44-3-223')!
    expect(s223.effective_date).toBe('2024-07-01')
    expect(s223.source_url).toBe('https://gov.georgia.gov/document/2024-signed-legislation/hb-220/download')
    expect(s223.body).toContain('or, if the instrument is silent, ten days’ written notice, the association may pursue injunctive relief')
    expect(s223.body).toContain('impose and assess fines, which shall not impact voting rights, to suspend temporarily voting rights for failure to pay regular and special assessments, and to suspend the right of use of certain common areas')
    // Struck text is gone.
    expect(s223.body).not.toContain('for damages or injunctive relief')
    expect(s223.body).not.toContain('certain of the common areas')

    const s230 = byCite.get('O.C.G.A. Section 44-3-230')!.body.split('\n\n')
    expect(s230).toHaveLength(2)
    expect(s230[0]).toMatch(/^\(a\) Meetings of the members .* at least 21 days in advance of any annual or regularly scheduled meeting/)
    expect(s230[0]).toContain('the “Uniform Electronic Transactions Act,”')
    expect(s230[1]).toMatch(/^\(b\) In the event an association fails to hold an annual meeting/)

    const s231 = byCite.get('O.C.G.A. Section 44-3-231')!.body.split('\n\n')
    expect(s231.slice(0, 5).map((p) => p.slice(0, 3))).toEqual(['(a)', '(1)', '(2)', '(3)', '(4)'])
    expect(s231[2]).toBe('(2) Make or cause to be made additional improvements on and as a part of the common area;')
    expect(s231[3].endsWith('to grant or withhold such approval; and')).toBe(true)
    // Release 86's (b)–(h) follow unchanged.
    expect(s231.slice(5).map((p) => p.slice(0, 3))).toEqual(['(b)', '(c)', '(d)', '(1)', '(2)', '(3)', '(e)', '(f)', '(g)', '(h)'])
  })

  it('does NOT apply SB 406 §§ 3–6 (effective 2027-01-01): § 44-3-232(c) still reads 30 days / $2,000 / four years', () => {
    const c = byCite.get('O.C.G.A. Section 44-3-232')!.body.split('\n\n').find((p) => p.startsWith('(c) '))!
    expect(c).toMatch(/^\(c\) Not less than 30 days after notice/)
    expect(c).toContain('at least $2,000.00')
    expect(c).toContain('four years after the assessment or installment first became due')
  })

  it('carries SB 406 § 7 (in force 2026-07-01) as its own record', () => {
    const fees = byCite.get('Ga. L. 2026, SB 406, § 7')!
    expect(fees.effective_date).toBe('2026-07-01')
    expect(fees.category).toBe('dues')
    expect(fees.source_url).toBe('https://www.legis.ga.gov/api/legislation/document/20252026/248665')
    expect(fees.body.split('\n\n').map((p) => p.slice(0, 3))).toEqual(['(f)', '(1)', '(2)', '(3)', '(g)'])
    expect(fees.body).toContain('(2) Lot owners with 30 days from the receipt of the notice')
  })

  it('rejects a malformed snapshot instead of returning a partial set', () => {
    const head = '@source_name: x\n@retrieved: 2026-10-20\n@valid_until: 2027-01-01\n'
    const sec = (cite: string, url = 'https://example.test/s') => `=== ${cite} | T\n@source_url: ${url}\nText.\n`
    expect(() => parseGeorgiaSnapshot(sec('O.C.G.A. Section 44-3-220'))).toThrow(/missing @source_name/)
    expect(() => parseGeorgiaSnapshot(head + sec('O.C.G.A. Section 44-3-220', 'http://x'))).toThrow(/https @source_url/)
    expect(() => parseGeorgiaSnapshot(head + sec('O.C.G.A. Section 44-5-60'))).toThrow(/outside the adapter's scope/)
    expect(() =>
      parseGeorgiaSnapshot(head + sec('O.C.G.A. Section 44-3-220') + sec('O.C.G.A. Section 44-3-220')),
    ).toThrow(/duplicate/)
    expect(() => parseGeorgiaSnapshot(head + '=== O.C.G.A. Section 44-3-220 | T\n@source_url: https://x\n')).toThrow(
      /has no text/,
    )
    expect(() => parseGeorgiaSnapshot('stray text\n' + head)).toThrow(/unexpected line/)
  })
})

describe('georgia-snapshot.generated.ts', () => {
  it('is exactly the committed snapshot (re-run scripts/build-ga-statute-snapshot.ts after editing it)', () => {
    expect(GA_SNAPSHOT).toBe(FIXTURE)
  })
})

describe('georgiaAdapter', () => {
  it('is wired into the refresh job state list and the adapter registry', () => {
    expect(SOURCE_STATES).toContain('GA')
    const a = adapterFor('GA', { now: BEFORE_EXPIRY })!
    expect(a.state).toBe('GA')
    expect(a.offline).toBe(true)
  })

  it('serves the embedded snapshot without any network access', async () => {
    const out = await georgiaAdapter({ now: BEFORE_EXPIRY }).fetchSections()
    expect(out.records).toHaveLength(18)
    expect(out.sourceName).toBe(parseGeorgiaSnapshot(FIXTURE).sourceName)
  })

  it('refuses to serve the snapshot from its @valid_until date (SB 406 §§ 3–6 take effect)', async () => {
    const lastDay = georgiaAdapter({ now: () => new Date('2026-12-31T23:59:59Z') })
    await expect(lastDay.fetchSections()).resolves.toBeTruthy()
    const expired = georgiaAdapter({ now: () => new Date('2027-01-01T00:00:00Z') })
    await expect(expired.fetchSections()).rejects.toBeInstanceOf(SourceUnavailableError)
    await expect(expired.fetchSections()).rejects.toThrow(/out of date from 2027-01-01/)
  })

  it('refuses a snapshot missing Art. 6 sections', async () => {
    const short = FIXTURE.split('=== O.C.G.A. Section 44-3-234 |')[0]
    await expect(georgiaAdapter({ snapshot: short, now: BEFORE_EXPIRY }).fetchSections()).rejects.toThrow(
      /15 sections \(< 17\)/,
    )
  })

  it('covers Art. 6 rows in the production citation form only — never other titles or the "§" starter rows', () => {
    for (const c of ART6) expect(georgiaCovers(c)).toBe(true)
    expect(georgiaCovers('O.C.G.A. Section 44-3-225(b)')).toBe(true) // seed sub-row
    expect(georgiaCovers('O.C.G.A. Section 44-3-236')).toBe(true) // seed row; not a section of the Act
    expect(georgiaCovers('Ga. L. 2026, SB 406, § 7')).toBe(true)
    for (const c of [
      'O.C.G.A. Section 44-5-60',
      'O.C.G.A. Section 44-5-60.1',
      'O.C.G.A. Section 14-3-701',
      'O.C.G.A. Section 44-3-106',
      'O.C.G.A. § 44-3-232',
    ]) {
      expect(georgiaCovers(c)).toBe(false)
    }
  })
})

describe('first refresh against the production GA seed (migrations/seed-state-law-ga.sql)', () => {
  // The citations the seed loaded, with paraphrased bodies and no hash.
  const seedCitations = [
    ...['220', '221', '222', '223', '224', '225', '225(b)', '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236'].map(
      (n) => `O.C.G.A. Section 44-3-${n}`,
    ),
    'O.C.G.A. Section 44-5-60',
    'O.C.G.A. Section 44-5-60.1',
    'O.C.G.A. Section 44-5-61',
    'O.C.G.A. Section 44-5-62',
    'O.C.G.A. Section 14-3-701',
    'O.C.G.A. Section 14-3-720',
    'O.C.G.A. Section 14-3-805',
    'O.C.G.A. Section 14-3-830',
    'O.C.G.A. Section 14-3-851',
  ]
  const existing: ExistingStatuteRow[] = seedCitations.map((c, i) => ({
    id: `row-${i}`,
    code_citation: c,
    title: 'Paraphrased',
    category: 'governance',
    body: `Paraphrased summary of ${c}.`,
    source_url: 'https://law.justia.com/…',
    source_name: null,
    content_hash: null,
    superseded_at: null,
  }))

  it('replaces the paraphrases in place, adds the two new records, and retires only the two non-sections', async () => {
    const { sourceName, records } = await georgiaAdapter({ now: BEFORE_EXPIRY }).fetchSections()
    const plan = planStatuteSync({ state: 'GA', sourceName, records, existing, covers: georgiaCovers })

    const changed = plan.writes.filter((w) => w.kind === 'changed').map((w) => w.record.code_citation)
    const added = plan.writes.filter((w) => w.kind === 'added').map((w) => w.record.code_citation)
    expect(changed).toHaveLength(16)
    expect(added).toEqual(['O.C.G.A. Section 44-3-232.1', 'Ga. L. 2026, SB 406, § 7'])
    expect(plan.removals.map((r) => r.codeCitation).sort()).toEqual([
      'O.C.G.A. Section 44-3-225(b)',
      'O.C.G.A. Section 44-3-236',
    ])
    expect(plan.unchanged).toEqual([])
  })

  it('a second run over the text it just wrote is a no-op', async () => {
    const { sourceName, records } = await georgiaAdapter({ now: BEFORE_EXPIRY }).fetchSections()
    const loaded: ExistingStatuteRow[] = records.map((r, i) => ({
      id: `ga-${i}`,
      code_citation: r.code_citation,
      title: r.title,
      category: r.category,
      body: r.body,
      source_url: r.source_url,
      source_name: sourceName,
      content_hash: statuteContentHash(r.body),
      superseded_at: null,
    }))
    const plan = planStatuteSync({ state: 'GA', sourceName, records, existing: loaded, covers: georgiaCovers })
    expect(plan.writes).toEqual([])
    expect(plan.removals).toEqual([])
    expect(plan.unchanged.every((u) => !u.backfillHash && !u.metadataChanged)).toBe(true)
  })
})
