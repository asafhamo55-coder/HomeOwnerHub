import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_QUORUM_CITATIONS, GA_BYLAWS_OVERRIDE, GA_KIT_QUORUM_PCT, proxyLaw } from './law'
import { MAX_KIT_HOMES, quorumNeeded } from './quorum'

/**
 * BL-150: every quote the quorum kit shows, checked word for word against
 * the statute text kept in the repo (scripts/fixtures/state-law), inside
 * the section its citation names.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const gaText = readFileSync(path.join(root, 'scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt'), 'utf8')

function gaSection(n: string): string {
  const start = gaText.indexOf(`=== O.C.G.A. Section ${n} |`)
  expect(start, n).toBeGreaterThanOrEqual(0)
  const end = gaText.indexOf('\n=== ', start + 1)
  return norm(gaText.slice(start, end === -1 ? undefined : end))
}

/** The subsection's own text, "(a) …" up to the next "(x) " at a line start. */
function gaSubsection(n: string, sub: string): string {
  const start = gaText.indexOf(`=== O.C.G.A. Section ${n} |`)
  const end = gaText.indexOf('\n=== ', start + 1)
  const body = gaText.slice(start, end === -1 ? undefined : end)
  const lines = body.split('\n')
  const i = lines.findIndex((l) => l.startsWith(`(${sub}) `))
  expect(i, `${n}(${sub})`).toBeGreaterThanOrEqual(0)
  const out = [lines[i]!]
  for (const l of lines.slice(i + 1)) {
    if (/^\([a-z]\) /.test(l)) break
    out.push(l)
  }
  return norm(out.join(' '))
}

function sectionFor(cite: string): string {
  const m = /^O\.C\.G\.A\. § (44-3-\d+)(?:\(([a-z])\))?$/.exec(cite)
  if (!m) throw new Error(`unknown citation ${cite}`)
  return m[2] ? gaSubsection(m[1]!, m[2]) : gaSection(m[1]!)
}

describe('every quorum-kit quote is in the statute text in the repo', () => {
  it('quotes something', () => {
    expect(ALL_QUORUM_CITATIONS.length).toBeGreaterThanOrEqual(7)
  })
  for (const c of ALL_QUORUM_CITATIONS) {
    it(`${c.cite}: “${c.quote.slice(0, 50)}…”`, () => {
      expect(sectionFor(c.cite)).toContain(norm(c.quote))
    })
  }

  it('every quote the Georgia note shows is one the test checks', () => {
    for (const q of proxyLaw('GA').quotes) expect(ALL_QUORUM_CITATIONS).toContain(q)
  })
})

describe('Georgia: the statute default, and the bylaws override', () => {
  const ga = proxyLaw('GA')

  it('is verified and accepts "Georgia" spelled out', () => {
    expect(ga.verified).toBe(true)
    expect(proxyLaw('georgia').state).toBe('GA')
    expect(ga.title).toContain('44-3-228')
  })

  it('the quorum hint says more than one-third, present at the start, and that the bylaws control', () => {
    expect(ga.statuteQuorum).not.toBeNull()
    const rule = ga.statuteQuorum!.rule
    expect(rule).toContain('more than one-third')
    expect(rule).toContain('at the start')
    expect(rule).toContain('unless your declaration or bylaws provide otherwise')
    expect(rule).toContain(GA_BYLAWS_OVERRIDE)
    expect(ga.boardNotes[0]).toBe(GA_BYLAWS_OVERRIDE)
    // The fixture really does let the bylaws override the members' quorum.
    expect(sectionFor('O.C.G.A. § 44-3-228')).toContain('Unless the instrument or bylaws provide otherwise, a quorum')
  })

  it('the counter target is exactly "more than one-third" for every roster up to 5,000 votes', () => {
    expect(ga.statuteQuorum!.pct).toBe(GA_KIT_QUORUM_PCT)
    for (let n = 1; n <= MAX_KIT_HOMES; n++) {
      expect(quorumNeeded(n, GA_KIT_QUORUM_PCT)).toBe(Math.floor(n / 3) + 1)
    }
  })

  it('above 5,000 votes the counter never asks for fewer than more than one-third', () => {
    for (const n of [5001, 5002, 9999, 15000, 30001, 100000]) {
      const needed = quorumNeeded(n, GA_KIT_QUORUM_PCT)
      expect(needed).toBeGreaterThanOrEqual(Math.floor(n / 3) + 1)
      // 33.34% overshoots one-third by n / 15,000 votes: a vote or two on a very large roster.
      expect(needed - (Math.floor(n / 3) + 1)).toBeLessThanOrEqual(Math.ceil(n / 15000))
    }
  })

  it('the proxy form: a date line, notice-only revocation, joint owners and entity owners', () => {
    const form = ga.formClauses.join(' ')
    expect(form).toContain('An undated proxy is void')
    expect(form).toContain('revoked only by written notice delivered to the association')
    expect(form).toContain('§ 14-2-722 or § 14-3-724')
    expect(form).toContain('all signing owners agree')
    expect(form).toContain('must vote by proxy')
    // Nothing on the form may say it is revocable at will: that would void it.
    expect(form).not.toMatch(/revoked at any time/i)
  })

  it('tells the board 5% may call a missed annual meeting, and that the Nonprofit Code is not loaded', () => {
    const notes = ga.boardNotes.join(' ')
    expect(notes).toContain('5% of the voting power')
    expect(notes).toContain('never more than 25%')
    expect(notes).toContain('§ 14-3-724')
    expect(notes).toContain('check your bylaws')
    expect(ga.quotes.map((q) => q.cite)).toContain('O.C.G.A. § 44-3-230(b)')
  })

  it('the Nonprofit Code is named but never quoted (it is not in the repo)', () => {
    expect(ALL_QUORUM_CITATIONS.every((c) => !c.cite.includes('14-3'))).toBe(true)
  })
})
