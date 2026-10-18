import { describe, expect, it } from 'vitest'
import { GUIDE_ARTICLES } from '@/generated/guide'
import {
  BOARD_FIRST_WEEK_STEPS,
  FIRST_WEEK_DAYS,
  RESIDENT_FIRST_VISITS,
  RESIDENT_FIRST_WEEK_STEPS,
  boardFirstWeekKey,
  dismissBoardFirstWeek,
  dismissResidentFirstWeek,
  isBoardFirstWeekDismissed,
  isWithinFirstWeeks,
  recordResidentVisit,
  residentFirstWeekKey,
  type FirstWeekStorage,
} from './first-week'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-18T12:00:00Z')

function memory(): FirstWeekStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

const broken: FirstWeekStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('isWithinFirstWeeks (org created_at)', () => {
  it('is true for the first 14 days and false after', () => {
    expect(FIRST_WEEK_DAYS).toBe(14)
    expect(isWithinFirstWeeks(new Date(NOW).toISOString(), NOW)).toBe(true)
    expect(isWithinFirstWeeks(new Date(NOW - 13 * DAY).toISOString(), NOW)).toBe(true)
    expect(isWithinFirstWeeks(new Date(NOW - 14 * DAY - 1).toISOString(), NOW)).toBe(false)
  })

  it('is false when the date is missing or unreadable (no card beats a wrong card)', () => {
    expect(isWithinFirstWeeks(null, NOW)).toBe(false)
    expect(isWithinFirstWeeks(undefined, NOW)).toBe(false)
    expect(isWithinFirstWeeks('not a date', NOW)).toBe(false)
  })

  it('tolerates a little clock skew but not a far-future date', () => {
    expect(isWithinFirstWeeks(new Date(NOW + 60_000).toISOString(), NOW)).toBe(true)
    expect(isWithinFirstWeeks(new Date(NOW + 2 * DAY).toISOString(), NOW)).toBe(false)
  })
})

describe('steps', () => {
  it('board: 4–5 steps, each linking to a real board guide article', () => {
    expect(BOARD_FIRST_WEEK_STEPS.length).toBeGreaterThanOrEqual(4)
    expect(BOARD_FIRST_WEEK_STEPS.length).toBeLessThanOrEqual(5)
    for (const s of BOARD_FIRST_WEEK_STEPS) {
      const article = GUIDE_ARTICLES.find((a) => a.id === s.articleId)
      expect(article, s.articleId).toBeDefined()
      expect(article!.roles).not.toContain('resident')
      expect(s.href).toBe(`/help/${s.articleId}`)
      expect(s.secondary.href.startsWith('/')).toBe(true)
    }
  })

  it('resident: 4–5 steps into the resident portal, each with a resident guide link', () => {
    expect(RESIDENT_FIRST_WEEK_STEPS.length).toBeGreaterThanOrEqual(4)
    expect(RESIDENT_FIRST_WEEK_STEPS.length).toBeLessThanOrEqual(5)
    for (const s of RESIDENT_FIRST_WEEK_STEPS) {
      expect(s.href.startsWith('/resident')).toBe(true)
      expect(s.secondary.href).toBe(`/resident/help/${s.articleId}`)
      expect(GUIDE_ARTICLES.find((a) => a.id === s.articleId)?.roles).toContain('resident')
    }
  })
})

describe('board dismiss (browser storage)', () => {
  it('is remembered per org', () => {
    const s = memory()
    expect(isBoardFirstWeekDismissed(s, 'org-1')).toBe(false)
    dismissBoardFirstWeek(s, 'org-1')
    expect(isBoardFirstWeekDismissed(s, 'org-1')).toBe(true)
    expect(isBoardFirstWeekDismissed(s, 'org-2')).toBe(false)
    expect([...s.data.keys()]).toEqual([boardFirstWeekKey('org-1')])
  })

  it('storage that throws never breaks the page: read as not dismissed, write ignored', () => {
    expect(isBoardFirstWeekDismissed(broken, 'org-1')).toBe(false)
    expect(() => dismissBoardFirstWeek(broken, 'org-1')).not.toThrow()
    expect(isBoardFirstWeekDismissed(null, 'org-1')).toBe(false)
  })
})

describe('resident first visits (browser storage)', () => {
  it(`shows for the first ${RESIDENT_FIRST_VISITS} visits`, () => {
    const s = memory()
    const shown: boolean[] = []
    for (let i = 0; i < RESIDENT_FIRST_VISITS + 2; i++) shown.push(recordResidentVisit(s, 'org-1', NOW + i * DAY / 4).show)
    expect(shown).toEqual([...Array(RESIDENT_FIRST_VISITS).fill(true), false, false])
  })

  it('a reload within 30 minutes is the same visit', () => {
    const s = memory()
    for (let i = 0; i < 20; i++) expect(recordResidentVisit(s, 'org-1', NOW + i * 60_000).show).toBe(true)
    expect(JSON.parse(s.data.get(residentFirstWeekKey('org-1'))!).visits).toBe(1)
  })

  it(`stops after ${FIRST_WEEK_DAYS} days even with few visits`, () => {
    const s = memory()
    expect(recordResidentVisit(s, 'org-1', NOW).show).toBe(true)
    expect(recordResidentVisit(s, 'org-1', NOW + 15 * DAY).show).toBe(false)
  })

  it('dismiss hides it for good; scoped per org', () => {
    const s = memory()
    recordResidentVisit(s, 'org-1', NOW)
    dismissResidentFirstWeek(s, 'org-1', NOW)
    expect(recordResidentVisit(s, 'org-1', NOW + DAY).show).toBe(false)
    expect(recordResidentVisit(s, 'org-2', NOW + DAY).show).toBe(true)
  })

  it('dismiss before any visit is recorded still sticks', () => {
    const s = memory()
    dismissResidentFirstWeek(s, 'org-1', NOW)
    expect(recordResidentVisit(s, 'org-1', NOW).show).toBe(false)
  })

  it('without working storage it cannot tell a first visit, so it stays hidden', () => {
    expect(recordResidentVisit(broken, 'org-1', NOW).show).toBe(false)
    expect(recordResidentVisit(null, 'org-1', NOW).show).toBe(false)
    expect(() => dismissResidentFirstWeek(broken, 'org-1', NOW)).not.toThrow()
  })

  it('a corrupt stored value starts over rather than throwing', () => {
    const s = memory()
    s.data.set(residentFirstWeekKey('org-1'), '{nope')
    expect(recordResidentVisit(s, 'org-1', NOW).show).toBe(true)
    s.data.set(residentFirstWeekKey('org-1'), JSON.stringify({ firstSeen: 'x', visits: -3 }))
    expect(recordResidentVisit(s, 'org-1', NOW).show).toBe(true)
  })
})
