import { describe, expect, it } from 'vitest'
import {
  emptyListMessage,
  reasonPills,
  severityDotClass,
  severityLabel,
  severityTone,
  streetOf,
  type SeveritySource,
} from './severity'

const clean: SeveritySource = {
  balance: 0,
  daysOverdue: 0,
  openViolations: 0,
  violationsPastCure: 0,
  threadsNeedingReply: 0,
  hasOwner: true,
  hasTenure: true,
  hasUnitLink: true,
}

describe('severityTone', () => {
  it('maps ranks 1 and 2 to red', () => {
    expect(severityTone(1)).toBe('red')
    expect(severityTone(2)).toBe('red')
  })
  it('maps ranks 3 and 4 to amber', () => {
    expect(severityTone(3)).toBe('amber')
    expect(severityTone(4)).toBe('amber')
  })
  it('maps rank 5 to slate — a data gap is not urgency', () => {
    expect(severityTone(5)).toBe('slate')
  })
  it('maps rank 6 to clear', () => {
    expect(severityTone(6)).toBe('clear')
  })
  it('treats an unknown rank as clear rather than throwing', () => {
    expect(severityTone(99)).toBe('clear')
    expect(severityTone(0)).toBe('clear')
  })
})

describe('severityLabel', () => {
  it('gives every tone a text label, so colour is never the only cue', () => {
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      expect(severityLabel(rank).length).toBeGreaterThan(0)
    }
  })
  it('names the specific reason for the urgent ranks', () => {
    expect(severityLabel(1)).toMatch(/cure/i)
    expect(severityLabel(2)).toMatch(/past due/i)
  })
})

describe('severityDotClass', () => {
  it('uses the destructive token for red and literal amber for amber', () => {
    expect(severityDotClass('red')).toContain('destructive')
    expect(severityDotClass('amber')).toContain('amber')
  })
  it('returns a distinct class per tone', () => {
    const all = (['red', 'amber', 'slate', 'clear'] as const).map(severityDotClass)
    expect(new Set(all).size).toBe(4)
  })
})

describe('reasonPills', () => {
  it('returns nothing for a clean property', () => {
    expect(reasonPills(clean)).toEqual([])
  })

  it('reports past-cure violations as red and names the count', () => {
    const pills = reasonPills({ ...clean, openViolations: 2, violationsPastCure: 1 })
    expect(pills).toContainEqual({ text: '1 past cure date', tone: 'red' })
  })

  it('reports open violations in the cure window as amber', () => {
    const pills = reasonPills({ ...clean, openViolations: 2 })
    expect(pills).toContainEqual({ text: '2 violations', tone: 'amber' })
  })

  it('pluralises a single violation correctly', () => {
    const pills = reasonPills({ ...clean, openViolations: 1 })
    expect(pills).toContainEqual({ text: '1 violation', tone: 'amber' })
  })

  it('reports unread mail as amber', () => {
    const pills = reasonPills({ ...clean, threadsNeedingReply: 3 })
    expect(pills).toContainEqual({ text: '3 unread', tone: 'amber' })
  })

  it('reports a data gap as slate', () => {
    const pills = reasonPills({ ...clean, hasUnitLink: false })
    expect(pills).toContainEqual({ text: 'Missing data', tone: 'slate' })
  })

  it('collapses several data gaps into one pill', () => {
    const pills = reasonPills({ ...clean, hasOwner: false, hasTenure: false, hasUnitLink: false })
    expect(pills.filter((p) => p.text === 'Missing data')).toHaveLength(1)
  })

  it('does not emit a balance pill — balance renders in its own column', () => {
    const pills = reasonPills({ ...clean, balance: 1340, daysOverdue: 92 })
    expect(pills.every((p) => !/\$/.test(p.text))).toBe(true)
  })
})

describe('streetOf', () => {
  it('drops the city/state/zip that every row in an association repeats', () => {
    expect(streetOf('105 Springwood Pkwy, Atlanta, GA 30067')).toBe('105 Springwood Pkwy')
  })

  it('returns an address with no comma untouched', () => {
    expect(streetOf('105 Springwood Pkwy')).toBe('105 Springwood Pkwy')
  })

  it('splits on the FIRST comma, not the last', () => {
    // A second comma belongs to the city/state tail, never the street line.
    expect(streetOf('12 Elm St, Apt 4, Atlanta, GA 30067')).toBe('12 Elm St')
  })

  it('trims surrounding whitespace', () => {
    expect(streetOf('  105 Springwood Pkwy , Atlanta')).toBe('105 Springwood Pkwy')
  })

  it('survives an empty string rather than throwing', () => {
    expect(streetOf('')).toBe('')
  })
})

describe('emptyListMessage', () => {
  // The bug this replaced: every filter except 'attention' fell through to
  // "No properties yet.", so a manager who had just finished filling in
  // every record — or who filtered to Leased in an owner-occupied
  // association — was told their association has no homes.
  it('never claims the association is empty for a subset filter', () => {
    for (const f of ['attention', 'incomplete', 'owner_occupied', 'leased', 'unknown'] as const) {
      expect(emptyListMessage(f)).not.toBe('No properties yet.')
    }
  })

  it('reads as success for the two "you are done" filters', () => {
    expect(emptyListMessage('attention')).toBe('Nothing needs attention right now.')
    expect(emptyListMessage('incomplete')).toBe('Every property record is complete.')
  })

  it("only 'all' being empty means there are genuinely no properties", () => {
    expect(emptyListMessage('all')).toBe('No properties yet.')
  })

  it('returns a non-empty message for every filter', () => {
    for (const f of [
      'attention',
      'incomplete',
      'all',
      'owner_occupied',
      'leased',
      'unknown',
    ] as const) {
      expect(emptyListMessage(f).length).toBeGreaterThan(0)
    }
  })
})
