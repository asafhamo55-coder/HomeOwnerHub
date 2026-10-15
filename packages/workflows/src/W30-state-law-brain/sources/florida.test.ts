import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FL_CATEGORY,
  FL_MIN_SECTIONS,
  chapterUrl,
  decodeEntities,
  floridaAdapter,
  parseFloridaChapter,
} from './florida'
import { normalizeStatuteBody } from './normalize'
import type { HttpGetter, HttpResponse } from './types'
import { SourceUnavailableError } from './types'

/**
 * The fixture is the unmodified response of
 *   GET https://www.flsenate.gov/Laws/Statutes/2026/Chapter720/All
 * recorded 2026-10-15. These tests never touch the network.
 */
const FIXTURE = readFileSync(
  resolve(__dirname, '../../../../../scripts/fixtures/state-law/flsenate-ch720-2026.html'),
  'utf8',
)

/** Serves canned responses by URL and records every request made. */
function fixtureGetter(routes: Record<string, HttpResponse | undefined>): HttpGetter & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async get(url) {
      calls.push(url)
      const res = routes[url]
      if (!res) throw new Error(`unexpected request in test: ${url}`)
      return res
    },
  }
}

const ok = (url: string, body: string): HttpResponse => ({ status: 200, url, body })
const redirect = (url: string): HttpResponse => ({ status: 302, url, body: '' })

describe('parseFloridaChapter (recorded flsenate.gov Chapter 720, 2026)', () => {
  const records = parseFloridaChapter(FIXTURE, 2026)
  const byCite = new Map(records.map((r) => [r.code_citation, r]))

  it('extracts the 36 body sections, not the index entries (each number appears twice)', () => {
    expect(records).toHaveLength(36)
    expect(records[0].code_citation).toBe('Fla. Stat. § 720.301')
    expect(records.at(-1)!.code_citation).toBe('Fla. Stat. § 720.407')
    expect(new Set(records.map((r) => r.code_citation)).size).toBe(36)
  })

  it('keeps the statute text verbatim, one line per subsection/paragraph', () => {
    const defs = byCite.get('Fla. Stat. § 720.301')!
    expect(defs.title).toBe('Definitions')
    expect(defs.body.startsWith('As used in this chapter, the term:\n\n(1) “Assessment” or “amenity fee” means')).toBe(true)
    expect(defs.body).toContain('\n\n(a) Real property the use of which is dedicated to the association')
    expect(byCite.get('Fla. Stat. § 720.3015')!.body).toBe(
      'This chapter may be cited as the “Homeowners’ Association Act.”',
    )
  })

  it('excludes History and Note blocks, which are annotations rather than law', () => {
    for (const r of records) {
      expect(r.body).not.toMatch(/History\.—|ch\. 92-49|Former s\. 617\.301/)
    }
  })

  it('reassembles fractions split across spans', () => {
    expect(byCite.get('Fla. Stat. § 720.304')!.body).toContain('not larger than 4 1/2 feet by 6 feet')
  })

  it('stores bodies already in canonical form, so the stored text re-hashes identically', () => {
    for (const r of records) expect(normalizeStatuteBody(r.body)).toBe(r.body)
  })

  it('maps every section to the established category vocabulary, never a guess', () => {
    const vocabulary = new Set(['governance', 'meetings', 'records', 'dues', 'enforcement'])
    for (const r of records) {
      expect(r.category, r.code_citation).not.toBeNull()
      expect(vocabulary.has(r.category!)).toBe(true)
    }
    expect(Object.keys(FL_CATEGORY)).toHaveLength(36)
  })

  it('strips the catchline period and links each section to its official page', () => {
    const r = byCite.get('Fla. Stat. § 720.3085')!
    expect(r.title).toBe('Payment for assessments; lien claims')
    expect(r.source_url).toBe('https://www.flsenate.gov/Laws/Statutes/2026/720.3085')
    expect(r.effective_date).toBeNull()
  })
})

describe('floridaAdapter', () => {
  const now = () => new Date('2026-10-15T12:00:00Z')

  it('fetches the current edition with exactly one request', async () => {
    const http = fixtureGetter({ [chapterUrl(2026)]: ok(chapterUrl(2026), FIXTURE) })
    const out = await floridaAdapter({ http, now }).fetchSections()
    expect(http.calls).toEqual([chapterUrl(2026)])
    expect(out.sourceName).toBe('flsenate.gov Fla. Stat. Ch. 720 (2026)')
    expect(out.records).toHaveLength(36)
  })

  // flsenate.gov answers an unpublished edition year with a 302 to its
  // index (observed for 2027 on 2026-10-15).
  it('falls back to the previous edition when the current year is not published yet', async () => {
    const http = fixtureGetter({
      [chapterUrl(2027)]: redirect(chapterUrl(2027)),
      [chapterUrl(2026)]: ok(chapterUrl(2026), FIXTURE),
    })
    const out = await floridaAdapter({ http, now: () => new Date('2027-01-05T00:00:00Z') }).fetchSections()
    expect(http.calls).toEqual([chapterUrl(2027), chapterUrl(2026)])
    expect(out.sourceName).toBe('flsenate.gov Fla. Stat. Ch. 720 (2026)')
    expect(out.records[0].source_url).toBe('https://www.flsenate.gov/Laws/Statutes/2026/720.301')
  })

  it('refuses a truncated page rather than returning a short list (which would read as repeal)', async () => {
    const cut = FIXTURE.indexOf('<div class="Section"><span class="SectionNumber">720.303&')
    const truncated = FIXTURE.slice(0, cut)
    expect(parseFloridaChapter(truncated, 2026).length).toBeLessThan(FL_MIN_SECTIONS)
    const http = fixtureGetter({
      [chapterUrl(2026)]: ok(chapterUrl(2026), truncated),
      [chapterUrl(2025)]: { status: 503, url: chapterUrl(2025), body: '' },
    })
    await expect(floridaAdapter({ http, now }).fetchSections()).rejects.toBeInstanceOf(SourceUnavailableError)
    expect(http.calls).toHaveLength(2)
  })

  it('covers Chapter 720 citations only', () => {
    const a = floridaAdapter({ http: fixtureGetter({}), now })
    expect(a.covers('Fla. Stat. § 720.303')).toBe(true)
    expect(a.covers('Fla. Stat. § 720.30851')).toBe(true)
    expect(a.covers('Fla. Stat. § 718.112')).toBe(false)
    expect(a.covers('O.C.G.A. § 44-3-232')).toBe(false)
  })
})

describe('decodeEntities', () => {
  it('decodes hex, decimal and named entities, and leaves unknown ones alone', () => {
    expect(decodeEntities('720.301&#x2003;A &amp; B &#39;c&#39; &sect; &bogus;')).toBe(
      '720.301 A & B \'c\' § &bogus;',
    )
  })
})
