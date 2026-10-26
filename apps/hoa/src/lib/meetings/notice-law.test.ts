import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_NOTICE_CITATIONS,
  CA_BALLOTS,
  CA_ELECTION_MEETING,
  CA_ELECTION_NOTICE,
  CHECK_BYLAWS,
  FL_BOARD_DELIVERED,
  FL_BOARD_POSTED,
  FL_MEMBERS,
  FL_SPECIAL_ASSESSMENT,
  GA_CONDO_MEMBERS,
  GA_MEMBERS,
  checkMeetingNotice,
  daysUntil,
} from './notice-law'

/**
 * Every quote in notice-law.ts must be in the statute text the repo keeps
 * (scripts/fixtures/state-law), word for word. And the sections the
 * module says are NOT loaded must really be absent, so "check your
 * bylaws" stays honest.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => norm(fl.find((r) => r.code_citation === cite)?.body ?? '')
const caText = norm(fixture('ca-civ-davis-stirling-2026.txt'))
const caSection = (n: string) => {
  const t = fixture('ca-civ-davis-stirling-2026.txt')
  const start = t.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = t.indexOf('\n=== ', start + 1)
  return norm(t.slice(start, end === -1 ? undefined : end))
}

describe('citations are verbatim from the fixtures', () => {
  it('Florida § 720.303(2)(c)1 and 2', () => {
    const s = flSection('Fla. Stat. § 720.303')
    for (const c of [FL_BOARD_POSTED, FL_BOARD_DELIVERED, FL_SPECIAL_ASSESSMENT]) expect(s).toContain(c.quote)
  })

  it('Florida § 720.306(5)', () => {
    const s = flSection('Fla. Stat. § 720.306')
    expect(s).toContain('(5) NOTICE OF MEETINGS.')
    expect(s).toContain(FL_MEMBERS.quote)
  })

  it('California § 5115(b), (b)(3) and (c)', () => {
    const s = caSection('5115')
    for (const c of [CA_ELECTION_NOTICE, CA_ELECTION_MEETING, CA_BALLOTS]) expect(s).toContain(c.quote)
  })

  it('Georgia § 44-3-230(a)', () => {
    const t = fixture('ga-ocga-44-3-art6-2026.txt')
    const start = t.indexOf('=== O.C.G.A. Section 44-3-230 |')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(norm(t.slice(start, t.indexOf('\n=== ', start + 1)))).toContain(GA_MEMBERS.quote)
  })

  it('Georgia condominiums: § 44-3-102 (BL-155), from the Art. 3 fixture', () => {
    const t = fixture('ga-ocga-44-3-art3-2026.txt')
    const start = t.indexOf('=== O.C.G.A. Section 44-3-102 |')
    expect(start).toBeGreaterThanOrEqual(0)
    expect(norm(t.slice(start, t.indexOf('\n=== ', start + 1)))).toContain(GA_CONDO_MEMBERS.quote)
    expect(GA_CONDO_MEMBERS.cite).toBe('O.C.G.A. § 44-3-102')
    expect(GA_CONDO_MEMBERS.quote).toContain('shall state the time, place, and purpose of such meeting')
  })

  it('every exported citation is covered above', () => {
    expect(ALL_NOTICE_CITATIONS).toHaveLength(9)
  })

  it('CA § 4920 and TX § 209.0051 are NOT loaded — so they are "check your bylaws"', () => {
    expect(caText).not.toContain('=== Civ. Code § 4920.')
    expect(fixture('tx-prop-209-2026.txt')).not.toContain('209.0051')
    expect(fixture('tcss-pr209-2026-excerpt.htm')).not.toContain('209.0051')
  })
})

const at = (state: string | null, meetingType: string | null, meetingDate: string, today = '2026-10-20') =>
  checkMeetingNotice({ state, meetingType, meetingDate, today })

describe('daysUntil', () => {
  it('counts calendar days, across a month and DST', () => {
    expect(daysUntil('2026-10-20', '2026-11-03')).toBe(14)
    expect(daysUntil('2026-10-20', '2026-10-20')).toBe(0)
    expect(daysUntil('2026-10-20', '2026-10-19')).toBe(-1)
    expect(daysUntil('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysUntil('bad', '2026-10-20')).toBeNull()
  })
})

describe('Florida', () => {
  it('annual: 14 days under § 720.306(5) — 13 is short, 14 is ok', () => {
    const short = at('FL', 'annual', '2026-11-02')
    expect(short).toMatchObject({ level: 'short', daysAhead: 13, minDays: 14 })
    expect(short.citations).toEqual([FL_MEMBERS])
    expect(at('FL', 'annual', '2026-11-03')).toMatchObject({ level: 'ok', daysAhead: 14 })
  })

  it('special (board or members unknown): the 14-day reading', () => {
    expect(at('fl', 'special', '2026-10-30')).toMatchObject({ level: 'short', minDays: 14 })
    expect(at('FL', 'special', '2026-10-30').citations).toEqual([FL_MEMBERS, FL_SPECIAL_ASSESSMENT])
    expect(at('FL', null, '2026-11-10')).toMatchObject({ level: 'ok' })
  })

  it('board: under 48 hours is short', () => {
    expect(at('FL', 'regular', '2026-10-21')).toMatchObject({ level: 'short', daysAhead: 1, minDays: 2 })
    expect(at('FL', 'regular', '2026-10-20')).toMatchObject({ level: 'short', daysAhead: 0 })
  })

  it('board: 2–6 days needs posting too (7 days if only delivered)', () => {
    const c = at('FL', 'regular', '2026-10-22')
    expect(c).toMatchObject({ level: 'caution', daysAhead: 2 })
    expect(c.message).toContain('conspicuous place')
    expect(c.citations).toContain(FL_BOARD_DELIVERED)
    expect(at('FL', 'regular', '2026-10-26')).toMatchObject({ level: 'caution', daysAhead: 6 })
  })

  it('board: 7–13 days is fine unless special assessments are on the agenda', () => {
    const c = at('FL', 'regular', '2026-10-27')
    expect(c).toMatchObject({ level: 'caution', daysAhead: 7 })
    expect(c.message).toContain('special assessments')
    expect(at('FL', 'regular', '2026-11-03')).toMatchObject({ level: 'ok', daysAhead: 14 })
  })

  it('emergency is exempt', () => {
    expect(at('FL', 'emergency', '2026-10-20')).toMatchObject({ level: 'exempt', minDays: null })
  })
})

describe('California', () => {
  it('board meetings: § 4920 is not loaded — check your bylaws', () => {
    for (const t of ['regular', 'special', 'emergency']) {
      const c = at('CA', t, '2026-10-21')
      expect(c).toMatchObject({ level: 'bylaws', message: CHECK_BYLAWS })
      expect(c.citations).toEqual([])
    }
  })

  it('annual: the § 5115 election note, a caution under 60 days', () => {
    const near = at('CA', 'annual', '2026-12-18') // 59 days
    expect(near).toMatchObject({ level: 'caution', daysAhead: 59 })
    expect(near.message).toContain('check your bylaws')
    expect(near.citations).toEqual([CA_ELECTION_NOTICE, CA_ELECTION_MEETING, CA_BALLOTS])
    expect(at('CA', 'annual', '2026-12-19')).toMatchObject({ level: 'bylaws', daysAhead: 60 })
  })
})

describe('Georgia (BL-141)', () => {
  it('annual: 21 days under § 44-3-230(a) — 20 is short, 21 is ok', () => {
    expect(at('GA', 'annual', '2026-11-09')).toMatchObject({ level: 'short', daysAhead: 20, minDays: 21 })
    expect(at('GA', 'annual', '2026-11-10')).toMatchObject({ level: 'ok', daysAhead: 21 })
    expect(at('GA', 'annual', '2026-11-10').citations).toEqual([GA_MEMBERS])
  })

  it('special: under 7 days is a caution (it may be a board meeting), 7 is ok', () => {
    expect(at('GA', 'special', '2026-10-26')).toMatchObject({ level: 'caution', minDays: 7 })
    expect(at('GA', 'special', '2026-10-27')).toMatchObject({ level: 'ok', daysAhead: 7 })
  })

  it('board and emergency meetings: Article 6 sets nothing — check your bylaws', () => {
    for (const t of ['regular', 'emergency', null]) expect(at('GA', t, '2026-10-21')).toMatchObject({ level: 'bylaws', citations: [] })
  })
})

describe('other states', () => {
  it('TX, GA, unknown and missing: check your bylaws, nothing cited', () => {
    for (const s of ['TX', 'GA', 'NY', null, 'Florida']) {
      const c = at(s, 'regular', '2026-10-21')
      expect(c.level).toBe('bylaws')
      expect(c.message).toBe(CHECK_BYLAWS)
      expect(c.citations).toEqual([])
    }
  })
})

describe('Georgia condominium associations (BL-155)', () => {
  const condo = (meetingType: string | null, meetingDate: string, associationType: string | null = 'condo') =>
    checkMeetingNotice({ state: 'GA', associationType, meetingType, meetingDate, today: '2026-10-20' })

  it('annual: 21 days under § 44-3-102, never § 44-3-230', () => {
    expect(condo('annual', '2026-11-09')).toMatchObject({ level: 'short', daysAhead: 20, minDays: 21 })
    expect(condo('annual', '2026-11-10')).toMatchObject({ level: 'ok', daysAhead: 21, minDays: 21 })
    for (const d of ['2026-11-09', '2026-11-10']) {
      const c = condo('annual', d)
      expect(c.citations).toEqual([GA_CONDO_MEMBERS])
      expect(c.citations.map((x) => x.cite).join(' ')).not.toContain('44-3-230')
      expect(c.message).toContain('time, place and purpose')
    }
  })

  it('special: 7 days, a caution under it (it may be a board meeting), with the purpose', () => {
    expect(condo('special', '2026-10-26')).toMatchObject({ level: 'caution', daysAhead: 6, minDays: 7, citations: [GA_CONDO_MEMBERS] })
    expect(condo('special', '2026-10-27')).toMatchObject({ level: 'ok', daysAhead: 7, citations: [GA_CONDO_MEMBERS] })
  })

  it('board and emergency meetings: check your bylaws, nothing cited', () => {
    for (const t of ['regular', 'emergency', null]) expect(condo(t, '2026-10-21')).toMatchObject({ level: 'bylaws', citations: [] })
  })

  it('a Georgia HOA, co-op or unknown type keeps the POA Act text unchanged', () => {
    for (const type of ['hoa', 'coop', null, undefined]) {
      const c = checkMeetingNotice({ state: 'GA', associationType: type, meetingType: 'annual', meetingDate: '2026-11-09', today: '2026-10-20' })
      expect(c).toEqual(at('GA', 'annual', '2026-11-09'))
      expect(c.citations).toEqual([GA_MEMBERS])
    }
  })

  it('a condo outside Georgia gets nothing from the Georgia Act', () => {
    expect(checkMeetingNotice({ state: 'TX', associationType: 'condo', meetingType: 'annual', meetingDate: '2026-11-09', today: '2026-10-20' })).toMatchObject({ level: 'bylaws', citations: [] })
  })
})

describe('edge cases', () => {
  it('a past meeting is "past" in every state', () => {
    expect(at('FL', 'annual', '2026-10-19')).toMatchObject({ level: 'past', daysAhead: -1 })
    expect(at('TX', 'regular', '2026-01-01').level).toBe('past')
  })

  it('an unreadable date falls back to the bylaws, never a false "ok"', () => {
    expect(at('FL', 'annual', 'not-a-date').level).toBe('bylaws')
  })
})
