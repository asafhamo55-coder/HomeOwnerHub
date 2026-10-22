import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_ELECTION_CITATIONS,
  CA_DAYS,
  CA_RECONVENE_QUORUM_PCT,
  CHECK_GOVERNING_DOCS,
  FL_CHALLENGE_DAYS,
  FL_MEMBER_NOTICE_DAYS,
  GA_ANNUAL_NOTICE_DAYS,
  GA_OTHER_NOTICE_DAYS,
  electionJurisdiction,
  electionNotes,
} from './law'

/**
 * BL-141: every quote the election planner shows, checked word for word
 * against the statute text kept in the repo (scripts/fixtures/state-law),
 * and every "not loaded" claim checked against the same files — so
 * "check your governing documents" stays honest.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const stripTags = (s: string) =>
  s
    .replace(/<span class="EnSpace"\/>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => norm(fl.find((r) => r.code_citation === cite)?.body ?? '')

const gaText = fixture('ga-ocga-44-3-art6-2026.txt')
function gaSection(n: string): string {
  const start = gaText.indexOf(`=== O.C.G.A. Section ${n} |`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = gaText.indexOf('\n=== ', start + 1)
  return norm(gaText.slice(start, end === -1 ? undefined : end))
}

const caText = fixture('ca-civ-davis-stirling-2026.txt')
function caSection(n: string): string {
  const start = caText.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = caText.indexOf('\n=== ', start + 1)
  return norm(caText.slice(start, end === -1 ? undefined : end))
}

const tx209 = norm(stripTags(fixture('tcss-pr209-2026-excerpt.htm')))
function txSection(n: string): string {
  const start = tx209.indexOf(`Sec. ${n}.`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = tx209.indexOf(' Sec. 209.', start + 1)
  return tx209.slice(start, end === -1 ? undefined : end)
}

function sectionFor(cite: string): string {
  const fla = /^Fla\. Stat\. § (720\.\d+)/.exec(cite)
  if (fla) return flSection(`Fla. Stat. § ${fla[1]}`)
  const ga = /^O\.C\.G\.A\. § (44-3-[\d.]+?)(\(|$)/.exec(cite)
  if (ga) return gaSection(ga[1]!)
  const ca = /^Cal\. Civ\. Code § (\d+)/.exec(cite)
  if (ca) return caSection(ca[1]!)
  const tx = /^Tex\. Prop\. Code § (209\.\d+)/.exec(cite)
  if (tx) return txSection(tx[1]!)
  throw new Error(`unknown citation ${cite}`)
}

describe('every election quote is in the statute text in the repo', () => {
  for (const c of ALL_ELECTION_CITATIONS) {
    it(`${c.cite}: “${c.quote.slice(0, 50)}…”`, () => {
      expect(sectionFor(c.cite)).toContain(norm(c.quote))
    })
  }

  it('every quote shown in a note is in the checked list', () => {
    const checked = new Set(ALL_ELECTION_CITATIONS)
    for (const j of ['GA', 'FL', 'CA', 'TX', 'generic'] as const) {
      for (const n of electionNotes(j)) for (const c of n.citations) expect(checked.has(c)).toBe(true)
    }
  })
})

describe('the day counts come from the quoted text', () => {
  it('GA § 44-3-230(a): 21 days annual, 7 days otherwise', () => {
    expect(GA_ANNUAL_NOTICE_DAYS).toBe(21)
    expect(GA_OTHER_NOTICE_DAYS).toBe(7)
    expect(gaSection('44-3-230')).toContain('at least 21 days in advance of any annual or regularly scheduled meeting and at least seven days in advance of any other meeting')
  })

  it('FL: 14 days’ notice, 60-day challenge', () => {
    expect(FL_MEMBER_NOTICE_DAYS).toBe(14)
    expect(FL_CHALLENGE_DAYS).toBe(60)
    expect(flSection('Fla. Stat. § 720.306')).toContain('not less than 14 days prior to the meeting')
    expect(flSection('Fla. Stat. § 720.306')).toContain('within 60 days after the election results are announced')
  })

  it('CA §§ 5103, 5115, 5120 day counts', () => {
    expect(caSection('5115')).toContain(`at least ${CA_DAYS.nominationNotice} days before any deadline for submitting a nomination`)
    expect(caSection('5115')).toContain(`at least ${CA_DAYS.generalNotice} days before the ballots are distributed`)
    expect(caSection('5115')).toContain(`not less than ${CA_DAYS.ballots} days prior to the deadline for voting`)
    expect(caSection('5115')).toContain(`a date at least ${CA_DAYS.reconveneAfter} days after the adjourned meeting`)
    expect(caSection('5115')).toContain(`No less than ${CA_DAYS.reconveneNotice} days prior to the date of the reconvened meeting`)
    expect(caSection('5115')).toContain(`shall be ${CA_RECONVENE_QUORUM_PCT} percent of the association’s members`)
    expect(caSection('5120')).toContain(`Within ${CA_DAYS.results} days of the election`)
    expect(caSection('5103')).toContain(`at least ${CA_DAYS.acclamationInitial} days before the deadline`)
    expect(caSection('5103')).toContain(`between ${CA_DAYS.acclamationReminderLatest} and ${CA_DAYS.acclamationReminderEarliest} days before the deadline`)
  })
})

describe('what is NOT loaded stays "check your governing documents"', () => {
  it('Georgia Article 6 has no nomination, secret-ballot, inspector or challenge rule', () => {
    // The text in force before 2027 (BL-154: the dated 2027 records follow it).
    const article = norm(gaText.slice(gaText.indexOf('=== O.C.G.A. Section 44-3-220'), gaText.lastIndexOf('=== O.C.G.A. Section 44-3-222 |')))
    // SB 406's 2027 text adds no election rule either: its one new "challenge" is discriminatory practices (§ 43-17A-7(12)).
    const in2027 = norm(gaText.slice(gaText.lastIndexOf('=== O.C.G.A. Section 44-3-222 |')))
    expect(in2027).not.toMatch(/\bnominat|secret ballot|inspector|\belection results\b/i)
    expect(in2027.match(/challeng[a-z]* (?!the validity)[a-z]+/gi)).toEqual(['Challenge discriminatory'])
    expect(article).not.toMatch(/\bnominat/i) // "denominated" (§ 44-3-221) is not a nomination
    expect(article).not.toMatch(/secret ballot/i)
    expect(article).not.toMatch(/inspector/i)
    expect(article).not.toMatch(/\belection results\b/i)
    // The one "challenging" is about amending the instrument (§ 44-3-226), not an election.
    expect(article.match(/challeng/gi)).toHaveLength(1)
    expect(gaSection('44-3-226')).toContain('the party challenging the validity of the adoption of the amendment')
    expect(gaText).toContain('@valid_until: 2027-07-01')
  })

  it('Georgia Title 14 (nonprofit corporations) is not a fixture', () => {
    expect(gaText).not.toMatch(/=== O\.C\.G\.A\. Section 14-/)
  })

  it('Texas §§ 209.00592–209.00594 and 209.0051 are in no TX fixture', () => {
    for (const f of ['tx-prop-209-2026.txt', 'tcss-pr209-2026-excerpt.htm', 'tx-prop-209-004-2026.txt', 'tx-prop-209-0062-2026.txt']) {
      const t = fixture(f)
      for (const s of ['209.00592.', '209.00593.', '209.00594.', '209.0051.']) expect(t).not.toContain(`Sec. ${s}`)
    }
    expect(ALL_ELECTION_CITATIONS.some((c) => /209\.0059\d|209\.0051/.test(c.cite))).toBe(false)
  })

  it('only the four loaded states have notes with quotes', () => {
    expect(electionNotes('generic')).toEqual([{ tone: 'info', text: CHECK_GOVERNING_DOCS, citations: [] }])
    const tx = electionNotes('TX')
    expect(tx[tx.length - 1]!.citations).toEqual([])
    expect(tx[tx.length - 1]!.text).toContain('Check your governing documents')
  })
})

describe('electionJurisdiction', () => {
  it('maps codes and names; anything else is generic', () => {
    expect(electionJurisdiction('ga')).toBe('GA')
    expect(electionJurisdiction('Georgia')).toBe('GA')
    expect(electionJurisdiction(' FL ')).toBe('FL')
    expect(electionJurisdiction('California')).toBe('CA')
    expect(electionJurisdiction('TX')).toBe('TX')
    expect(electionJurisdiction('NV')).toBe('generic')
    expect(electionJurisdiction(null)).toBe('generic')
  })

  it('Georgia comes with the most notes after Florida and California, all informational', () => {
    const ga = electionNotes('GA')
    expect(ga.length).toBeGreaterThanOrEqual(5)
    expect(ga.every((n) => n.tone === 'info')).toBe(true)
    expect(ga[0]!.text).toContain('no nomination procedure')
  })
})
