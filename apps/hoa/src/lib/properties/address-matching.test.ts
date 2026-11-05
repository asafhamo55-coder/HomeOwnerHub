import { describe, expect, it } from 'vitest'
import { addressKey, normalizeAddress } from './normalize-address'
import { buildHomeIndex, matchHome } from './match-home'
import { matchesSearch } from './list-view'
import { standardAddress } from './address-format'

describe('addressKey (standard format first, then normalizeAddress)', () => {
  it('matches a saved standard address against every way it is typed elsewhere', () => {
    const saved = addressKey('1234 Peachtree St NE, Apt 5, Atlanta, GA 30309')
    expect(addressKey('1234 Peachtree Street Northeast Apartment 5, Atlanta, Georgia 30309')).toBe(saved)
    expect(addressKey('1234 peachtree street ne, apt 5, atlanta, ga 30309')).toBe(saved)
  })

  it('matches an old-style row against a standard one', () => {
    expect(addressKey('214 Oak Lane')).toBe(addressKey('214 Oak Ln'))
    expect(addressKey('77 Main Street Southwest')).toBe(addressKey('77 Main St SW'))
    expect(addressKey('123 North Main Street')).toBe(addressKey('123 N Main St'))
  })

  it('still matches everything normalizeAddress matched', () => {
    expect(addressKey('214 Oak Lane')).toBe(addressKey('214 OAK LN.'))
    expect(addressKey('12 Court Street')).toBe(normalizeAddress('12 Court Street'))
    for (const a of ['214 Oak Lane', '1 A Street', '9 Elm Ave.', '5 Twin Lane']) {
      expect(addressKey(a)).toBe(normalizeAddress(a))
    }
  })

  it('keeps different homes apart', () => {
    expect(addressKey('12 Oak St')).not.toBe(addressKey('21 Oak St'))
    expect(addressKey('12 Oak St')).not.toBe(addressKey('12 Oak Ln'))
    expect(addressKey('12 Oak St, Apt 1')).not.toBe(addressKey('12 Oak St, Apt 2'))
  })

  it('is empty for empty input', () => {
    expect(addressKey(null)).toBe('')
    expect(addressKey('  ')).toBe('')
  })
})

describe('matchHome with addresses saved in the standard format', () => {
  const idx = buildHomeIndex([
    { id: 's1', address: '77 Main St SW, Atlanta, GA 30303', unit_number: null },
    { id: 's2', address: '123 N Main St', unit_number: '4' },
  ])
  it('finds a standard row from CSV, email or CINC text typed the long way', () => {
    expect(matchHome(idx, '77 Main Street Southwest, Atlanta, Georgia 30303', null)).toEqual({ kind: 'match', propertyId: 's1' })
    expect(matchHome(idx, '123 NORTH MAIN STREET', '4')).toEqual({ kind: 'match', propertyId: 's2' })
  })
  it('finds an old-style row from a standard address', () => {
    const old = buildHomeIndex([{ id: 'o1', address: '9 Rose Avenue Northeast', unit_number: null }])
    expect(matchHome(old, '9 Rose Ave NE', null)).toEqual({ kind: 'match', propertyId: 'o1' })
  })
})

describe('roster re-import finds a home saved in the standard format (integration fixtures)', () => {
  it('saves "100 Fixture Lane" as "100 Fixture Ln", so reads back by the saved form', () => {
    expect(standardAddress('100 Fixture Lane')).toBe('100 Fixture Ln')
    expect(standardAddress('200 Fixture Lane')).toBe('200 Fixture Ln')
  })

  it('a re-import typed any way matches the saved row, and a row seeded raw still matches', () => {
    const saved = buildHomeIndex([
      { id: 'a', address: standardAddress('100 Fixture Lane'), unit_number: null },
      { id: 'b', address: standardAddress('200 Fixture Lane'), unit_number: '1' },
      { id: 'c', address: standardAddress('200 Fixture Lane'), unit_number: '2' },
    ])
    expect(matchHome(saved, '100 fixture lane', null)).toEqual({ kind: 'match', propertyId: 'a' })
    expect(matchHome(saved, '100 Fixture Lane', null)).toEqual({ kind: 'match', propertyId: 'a' })
    expect(matchHome(saved, '200 Fixture Lane', '2')).toEqual({ kind: 'match', propertyId: 'c' })
    const seededRaw = buildHomeIndex([{ id: 'r', address: '100 Fixture Lane', unit_number: null }])
    expect(matchHome(seededRaw, standardAddress('100 fixture lane'), null)).toEqual({ kind: 'match', propertyId: 'r' })
  })
})

describe('standardAddress (what is saved)', () => {
  it('formats, and falls back to the trimmed input when nothing is left', () => {
    expect(standardAddress('1234 peachtree street northeast, georgia')).toBe('1234 Peachtree St NE, Georgia')
    expect(standardAddress('  ,,  ')).toBe(',,')
    expect(standardAddress(standardAddress('105 SPRINGWOOD PARKWAY, ATLANTA, GA 30067'))).toBe('105 Springwood Pkwy, Atlanta, GA 30067')
  })
})

describe('matchesSearch against standard addresses', () => {
  const row = { id: 'p', address: '77 Main St SW, Atlanta, GA 30303', unitNumber: null, ownerName: null, ownerEmail: null, ownerPhone: null }
  it('finds "Main St" by the long form and by a fragment', () => {
    expect(matchesSearch(row, 'main street', new Set())).toBe(true)
    expect(matchesSearch(row, 'main st', new Set())).toBe(true)
    expect(matchesSearch(row, '77 main', new Set())).toBe(true)
    expect(matchesSearch(row, 'elm', new Set())).toBe(false)
  })
})
