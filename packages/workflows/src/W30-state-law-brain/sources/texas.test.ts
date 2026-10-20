import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeStatuteBody } from './normalize'
import {
  TX_CATEGORY,
  parseTexasChapter,
  sentenceCaseCatchline,
  texasAdapter,
  texasChapterUrl,
} from './texas'
import type { HttpGetter, HttpResponse } from './types'
import { SourceUnavailableError } from './types'

/**
 * Excerpts of the Texas Legislative Council's chapter files
 *   https://tcss.legis.texas.gov/resources/PR/htm/PR.209.htm (and PR.202.htm)
 * recorded 2026-10-20, unmodified apart from dropping the sections the tests
 * do not need (see each file's leading comment). No network.
 */
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../../../../../scripts/fixtures/state-law', name), 'utf8')
const CH209 = fixture('tcss-pr209-2026-excerpt.htm')
const CH202 = fixture('tcss-pr202-2026-excerpt.htm')

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

describe('parseTexasChapter (recorded Tex. Prop. Code ch. 209 excerpt)', () => {
  const records = parseTexasChapter(CH209, '209')
  const byCite = new Map(records.map((r) => [r.code_citation, r]))

  it('extracts every section in the page, in order', () => {
    expect(records.map((r) => r.code_citation)).toEqual([
      'Tex. Prop. Code § 209.001',
      'Tex. Prop. Code § 209.002',
      'Tex. Prop. Code § 209.0058',
      'Tex. Prop. Code § 209.006',
      'Tex. Prop. Code § 209.017',
    ])
  })

  it('keeps the first paragraph that shares the catchline line, verbatim', () => {
    expect(byCite.get('Tex. Prop. Code § 209.001')!.body).toBe(
      'This chapter may be cited as the Texas Residential Property Owners Protection Act.',
    )
    const enforcement = byCite.get('Tex. Prop. Code § 209.006')!.body
    expect(enforcement.startsWith("(a) Before a property owners' association may suspend an owner's right")).toBe(true)
    expect(enforcement).toContain('must give written notice to the owner by certified mail.')
  })

  it('puts each subsection and paragraph on its own line', () => {
    const defs = byCite.get('Tex. Prop. Code § 209.002')!.body
    expect(defs.startsWith('In this chapter:\n\n(1) "Assessment" means a regular assessment')).toBe(true)
    expect(defs).toContain('\n\n(2) "Board" means the governing body of a property owners\' association.')
  })

  it('excludes the history ("Added by Acts …", "Amended by:" and its list), which is not law', () => {
    for (const r of records) {
      expect(r.body).not.toMatch(/Added by Acts|Amended by:|\n\nActs \d{4}/)
    }
  })

  // § 209.0058 publishes two versions of some subsections, each introduced
  // by a "Text of subsection as amended by …" note. Dropping the notes would
  // leave two contradictory subsections with nothing saying why.
  it('keeps the "Text of subsection as amended by" notes that tell two versions apart', () => {
    const ballots = byCite.get('Tex. Prop. Code § 209.0058')!.body
    expect(ballots).toContain('Text of subsection as amended by Acts 2015, 84th Leg., R.S., Ch. 249 (S.B. 864), Sec. 1')
    expect(ballots).toContain('Text of subsection as amended by Acts 2015, 84th Leg., R.S., Ch. 1183 (S.B. 1168), Sec. 11')
  })

  it('stores bodies already in canonical form, so the stored text re-hashes identically', () => {
    for (const r of records) expect(normalizeStatuteBody(r.body)).toBe(r.body)
  })

  it('titles from the catchline in sentence case, categories from the static map', () => {
    expect(byCite.get('Tex. Prop. Code § 209.006')!.title).toBe('Notice required before enforcement action')
    expect(byCite.get('Tex. Prop. Code § 209.006')!.category).toBe('enforcement')
    const vocabulary = new Set(['governance', 'meetings', 'records', 'dues', 'enforcement'])
    for (const v of Object.values(TX_CATEGORY)) expect(vocabulary.has(v)).toBe(true)
  })

  it('links each section to its anchor on the official statutes site', () => {
    expect(byCite.get('Tex. Prop. Code § 209.006')!.source_url).toBe(
      'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.209.htm#209.006',
    )
    expect(byCite.get('Tex. Prop. Code § 209.006')!.effective_date).toBeNull()
  })

  it('ignores sections of another chapter', () => {
    expect(parseTexasChapter(CH209, '202')).toEqual([])
  })
})

describe('parseTexasChapter (recorded ch. 202 excerpt)', () => {
  it('parses Chapter 202 the same way (flag display)', () => {
    const records = parseTexasChapter(CH202, '202')
    expect(records.map((r) => r.code_citation)).toEqual(['Tex. Prop. Code § 202.001', 'Tex. Prop. Code § 202.012'])
    const flags = records[1]
    expect(flags.title).toBe('Flag display')
    expect(flags.body).toContain('the flag of the United States of America')
    expect(flags.body).not.toMatch(/Added by Acts/)
  })
})

describe('sentenceCaseCatchline', () => {
  it('collapses doubled spaces and drops the final period', () => {
    expect(sentenceCaseCatchline('HEARING BEFORE BOARD;  ALTERNATIVE DISPUTE RESOLUTION.')).toBe(
      'Hearing before board; alternative dispute resolution',
    )
    expect(sentenceCaseCatchline("ATTORNEY'S FEES.")).toBe("Attorney's fees")
  })
})

describe('texasAdapter', () => {
  const lowMin = { '209': 5, '202': 2 }

  it('fetches both chapters, one request each, and labels the source', async () => {
    const http = fixtureGetter({
      [texasChapterUrl('202')]: ok(texasChapterUrl('202'), CH202),
      [texasChapterUrl('209')]: ok(texasChapterUrl('209'), CH209),
    })
    const out = await texasAdapter({ http, minSections: lowMin }).fetchSections()
    expect(http.calls).toEqual([
      'https://tcss.legis.texas.gov/resources/PR/htm/PR.202.htm',
      'https://tcss.legis.texas.gov/resources/PR/htm/PR.209.htm',
    ])
    expect(out.sourceName).toBe('tcss.legis.texas.gov Tex. Prop. Code Ch. 202, 209')
    expect(out.records).toHaveLength(7)
  })

  it('refuses a page with too few sections rather than returning a short list (which would read as repeal)', async () => {
    const http = fixtureGetter({
      [texasChapterUrl('202')]: ok(texasChapterUrl('202'), CH202),
      [texasChapterUrl('209')]: ok(texasChapterUrl('209'), CH209),
    })
    // The production minimum (35 for ch. 209) against a 5-section excerpt.
    await expect(texasAdapter({ http }).fetchSections()).rejects.toBeInstanceOf(SourceUnavailableError)
  })

  it('fails the whole state when one chapter is unavailable', async () => {
    const http = fixtureGetter({
      [texasChapterUrl('202')]: ok(texasChapterUrl('202'), CH202),
      [texasChapterUrl('209')]: { status: 503, url: texasChapterUrl('209'), body: '' },
    })
    await expect(texasAdapter({ http, minSections: lowMin }).fetchSections()).rejects.toThrow(/HTTP 503/)
  })

  // The old statutes.capitol.texas.gov URLs answer with the app shell: a
  // 200 with no statute text. That must fail, not parse to zero sections
  // and supersede the chapter.
  it('treats a 200 with no sections (an app shell) as unavailable', async () => {
    const shell = '<!DOCTYPE html><html><head><title>Texas Constitution and Statutes</title></head><body><app-root></app-root></body></html>'
    const http = fixtureGetter({
      [texasChapterUrl('202')]: ok(texasChapterUrl('202'), shell),
    })
    await expect(texasAdapter({ http }).fetchSections()).rejects.toThrow(/0 sections parsed/)
  })

  it('covers Chapter 202 and 209 citations only', () => {
    const a = texasAdapter({ http: fixtureGetter({}) })
    expect(a.covers('Tex. Prop. Code § 209.006')).toBe(true)
    expect(a.covers('Tex. Prop. Code § 202.010')).toBe(true)
    expect(a.covers('Tex. Prop. Code § 82.102')).toBe(false)
    expect(a.covers('Fla. Stat. § 720.303')).toBe(false)
  })
})
