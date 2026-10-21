import { describe, expect, it } from 'vitest'
import { groupUnitsByStreet, matchStreet, streetAudienceLabel, streetKey, streetOf, streetSelection } from './streets'

// BL-102 A5: streets parsed from existing addresses. Synthetic addresses only.

describe('streetOf', () => {
  it.each([
    ['12 Elm St', 'Elm St'],
    ['12 Elm Street', 'Elm St'],
    ['12 elm st.', 'Elm St'],
    ['123 N Elm Street', 'N Elm St'],
    ['45 North Elm St', 'N Elm St'],
    ['7 Maple Ct, Lakeside, FL 33000', 'Maple Ct'],
    ['8 Maple Court Apt 4', 'Maple Ct'],
    ['8 Maple Court Unit 2B', 'Maple Ct'],
    ['8 Maple Ct #3', 'Maple Ct'],
    ['101A Oak Avenue', 'Oak Ave'],
    ['22-B Pine Rd NW', 'Pine Rd NW'],
    ['9 Court St', 'Court St'],
    ['14 Broadway', 'Broadway'],
    ['300 5th Ave', '5th Ave'],
  ])('%s → %s', (line, street) => {
    expect(streetOf(line)).toBe(street)
  })

  it.each([[null], [''], ['PO Box 12'], ['Lot 4'], ['12']])('%s has no street', (line) => {
    expect(streetOf(line)).toBeNull()
  })
})

describe('groupUnitsByStreet', () => {
  const units = [
    { id: 'u1', address_line1: '1 Elm St' },
    { id: 'u2', address_line1: '2 Elm Street' },
    { id: 'u3', address_line1: '3 elm st' },
    { id: 'u4', address_line1: '4 Maple Ct' },
    { id: 'u5', address_line1: null },
    { id: 'u6', address_line1: 'PO Box 9' },
  ]

  it('groups spellings of one street, largest first, and skips unparseable lines', () => {
    const streets = groupUnitsByStreet(units, new Set(['u1', 'u4']))
    expect(streets.map((s) => [s.label, s.unitIds, s.ownerCount])).toEqual([
      ['Elm St', ['u1', 'u2', 'u3'], 1],
      ['Maple Ct', ['u4'], 1],
    ])
  })
})

describe('matchStreet', () => {
  const streets = groupUnitsByStreet(
    [
      { id: 'u1', address_line1: '1 Elm St' },
      { id: 'u2', address_line1: '2 Maple Ct' },
      { id: 'u3', address_line1: '3 Maple Dr' },
    ],
    new Set(),
  )

  it('matches typed spellings of a real street', () => {
    expect(matchStreet('Elm Street', streets)?.label).toBe('Elm St')
    expect(matchStreet('elm st.', streets)?.label).toBe('Elm St')
    expect(matchStreet('Elm', streets)?.label).toBe('Elm St')
  })

  it('refuses an ambiguous or unknown street rather than guessing', () => {
    expect(matchStreet('Maple', streets)).toBeNull()
    expect(matchStreet('Oak St', streets)).toBeNull()
    expect(matchStreet(null, streets)).toBeNull()
  })
})

describe('labels', () => {
  it('reads in plain words', () => {
    expect(streetAudienceLabel('Elm St', false)).toBe('Homes on Elm St')
    expect(streetAudienceLabel('Elm St', true)).toBe('Owners on Elm St')
    expect(streetKey('N. Elm St')).toBe('n elm st')
  })
})

// BL-146: each street lists its homes so the board can untick some.
describe('street homes and selection', () => {
  const streets = groupUnitsByStreet(
    [
      { id: 'u10', address_line1: '10 Elm St' },
      { id: 'u2', address_line1: '2 Elm St' },
      { id: 'u3', address_line1: '3 Elm St' },
    ],
    new Set(['u2', 'u10']),
  )
  const elm = streets[0]!

  it('lists every home in house-number order, with whether an owner is on file', () => {
    expect(elm.homes).toEqual([
      { id: 'u2', label: '2 Elm St', hasOwner: true },
      { id: 'u3', label: '3 Elm St', hasOwner: false },
      { id: 'u10', label: '10 Elm St', hasOwner: true },
    ])
  })

  it('streetSelection sends the full list plus the exclusions, and counts the rest', () => {
    expect(streetSelection(elm, new Set(), false)).toEqual({ unitIds: elm.unitIds, excludeUnitIds: [], count: 3 })
    const pick = streetSelection(elm, new Set(['u3', 'other']), false)
    expect(pick.excludeUnitIds).toEqual(['u3'])
    expect(pick.count).toBe(2)
    expect(streetSelection(elm, new Set(['u2']), true).count).toBe(1)
  })
})
