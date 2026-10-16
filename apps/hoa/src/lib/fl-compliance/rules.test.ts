import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { floridaCitation, parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import { checkQuote } from './evaluate'
import { FL_RECORDS_CODE_CITATION, RECORD_CATEGORIES, allQuotes, noticeRuleFor } from './rules'

/**
 * The official text: the unmodified response of
 *   GET https://www.flsenate.gov/Laws/Statutes/2026/Chapter720/All
 * recorded 2026-10-15 (the W30 Florida ingestion's own fixture), parsed by
 * the ingestion's own parser — so the body here is byte-for-byte what the
 * refresh job stores in state_statutes.body.
 */
const HTML = readFileSync(
  resolve(__dirname, '../../../../../scripts/fixtures/state-law/flsenate-ch720-2026.html'),
  'utf8',
)
const section = parseFloridaChapter(HTML, 2026).find((r) => r.code_citation === FL_RECORDS_CODE_CITATION)
const BODY = section?.body ?? ''

/**
 * Label every paragraph of the body with its subsection path, e.g.
 * "(4)(b)1.a", from the leading markers the statute uses: "(4)", "(b)",
 * "(b)1.", "1.", "a.".
 */
function labelParagraphs(body: string): Array<{ label: string; text: string }> {
  let sub = ''
  let para = ''
  let subp = ''
  let subsub = ''
  const out: Array<{ label: string; text: string }> = []
  for (const text of body.split('\n\n')) {
    let m: RegExpExecArray | null
    if ((m = /^\((\d+)\)\s/.exec(text))) {
      sub = m[1]
      para = subp = subsub = ''
    } else if ((m = /^\(([a-z])\)(\d+)?\.?\s/.exec(text))) {
      para = m[1]
      subp = m[2] ?? ''
      subsub = ''
    } else if ((m = /^(\d+)\.\s/.exec(text))) {
      subp = m[1]
      subsub = ''
    } else if ((m = /^([a-z])\.\s/.exec(text))) {
      subsub = m[1]
    }
    const label = `(${sub})` + (para ? `(${para})` : '') + subp + (subsub ? `.${subsub}` : '')
    out.push({ label, text })
  }
  return out
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

describe('§ 720.303 quotes are verbatim official text', () => {
  it('the fixture parses to § 720.303', () => {
    expect(section, 'section missing from fixture').toBeDefined()
    expect(section!.code_citation).toBe(floridaCitation('720.303'))
    expect(BODY.length).toBeGreaterThan(10_000)
  })

  it.each(allQuotes().map((q) => [q.subsection, q] as const))('%s quote validates against the statute', (_s, q) => {
    expect(checkQuote(q, BODY)).toEqual({ kind: 'validated', subsection: q.subsection, quote: q.quote })
  })

  it.each(allQuotes().map((q) => [q.subsection, q] as const))('%s quote sits in that subsection', (subsection, q) => {
    const paragraphs = labelParagraphs(BODY)
    // A quote can also occur elsewhere ((4)(a)4 repeats (4)(b)1.c's
    // wording); it must occur in the subsection it claims.
    const labels = paragraphs.filter((p) => norm(p.text).includes(norm(q.quote))).map((p) => p.label)
    expect(labels, `quote for ${subsection} not found within one paragraph`).toContain(subsection)
  })

  it('covers every (4)(b)1 posting item except the two meeting-notice items', () => {
    const letters = RECORD_CATEGORIES.map((c) => c.citation.subsection)
      .filter((s) => s.startsWith('(4)(b)1.'))
      .map((s) => s.slice('(4)(b)1.'.length))
    // l and m are meeting notices — checked in the meetings section.
    expect(letters).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'])
    expect(noticeRuleFor('annual').citations.map((c) => c.subsection)).toContain('(4)(b)1.l')
  })

  it('a paraphrase does not validate', () => {
    expect(checkQuote({ subsection: '(4)(b)1.d', quote: 'The current rules of the HOA.' }, BODY)).toEqual({
      kind: 'mismatch',
      subsection: '(4)(b)1.d',
    })
  })

  it('category ids are unique', () => {
    const ids = RECORD_CATEGORIES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
