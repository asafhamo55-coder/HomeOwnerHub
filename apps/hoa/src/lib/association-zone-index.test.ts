import { describe, expect, it } from 'vitest'
import { buildZoneIndex, scopeTimeZone, scopeToday } from './association-zone-index'

// BL-065: a row scoped to an association (an event, a rule) reads that
// association's zone; an org-wide row reads the org's primary association
// (first by name, as /dues picks it). Zones are derived from rows only and
// "now" is an absolute instant, so the machine's TZ never matters.

const ROWS = [
  { id: 'a-ca', organization_id: 'org-1', name: 'Bay View', state: 'CA' },
  { id: 'a-fl', organization_id: 'org-1', name: 'Atlantic Shores', state: 'FL' },
  { id: 'a-hi', organization_id: 'org-2', name: 'Kona', state: 'HI' },
]

describe('scopeTimeZone', () => {
  const index = buildZoneIndex(ROWS)

  it('an association-scoped row reads its own association', () => {
    expect(scopeTimeZone(index, 'org-1', 'a-ca')).toBe('America/Los_Angeles')
    expect(scopeTimeZone(index, 'org-2', 'a-hi')).toBe('Pacific/Honolulu')
  })

  it('an org-wide row reads the primary association (first by name)', () => {
    expect(scopeTimeZone(index, 'org-1', null)).toBe('America/New_York') // Atlantic Shores < Bay View
    expect(scopeTimeZone(index, 'org-2', null)).toBe('Pacific/Honolulu')
  })

  it('an unknown association falls back to its org, then to Eastern', () => {
    expect(scopeTimeZone(index, 'org-2', 'gone')).toBe('Pacific/Honolulu')
    expect(scopeTimeZone(index, 'org-9', null)).toBe('America/New_York')
    expect(scopeTimeZone(buildZoneIndex([]), 'org-1', 'a-ca')).toBe('America/New_York')
  })
})

describe('scopeToday', () => {
  it('is the scoped association calendar day at the instant', () => {
    const index = buildZoneIndex(ROWS)
    const now = new Date('2026-10-16T03:30:00Z') // Oct 15 23:30 EDT, 20:30 PDT, 17:30 HST
    expect(scopeToday(index, 'org-1', 'a-ca', now)).toBe('2026-10-15')
    expect(scopeToday(index, 'org-1', null, now)).toBe('2026-10-15')
    const later = new Date('2026-10-16T04:30:00Z') // Oct 16 00:30 EDT
    expect(scopeToday(index, 'org-1', null, later)).toBe('2026-10-16')
    expect(scopeToday(index, 'org-1', 'a-ca', later)).toBe('2026-10-15')
  })
})
