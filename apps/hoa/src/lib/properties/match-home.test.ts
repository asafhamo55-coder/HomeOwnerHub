import { describe, expect, it } from 'vitest'
import { buildHomeIndex, matchHome, normalizeUnit, pickUnitAtAddress } from './match-home'

// Synthetic addresses only.
const index = buildHomeIndex([
  { id: 'p1', address: '1 Test Way', unit_number: null },
  { id: 'p2', address: '10 Condo Street', unit_number: 'Unit 1' },
  { id: 'p3', address: '10 Condo St.', unit_number: '2' },
  { id: 'p4', address: '5 Twin Ln', unit_number: null },
  { id: 'p5', address: '5 Twin Lane', unit_number: null },
])

describe('normalizeUnit', () => {
  it('ignores case, punctuation and unit/apt/lot/# prefixes', () => {
    expect(normalizeUnit('Unit 7')).toBe('7')
    expect(normalizeUnit('#7')).toBe('7')
    expect(normalizeUnit('Apt. 7-B')).toBe('7b')
    expect(normalizeUnit('Lot 12')).toBe('12')
    expect(normalizeUnit('  ')).toBe('')
    expect(normalizeUnit(null)).toBe('')
  })
})

describe('matchHome (normalized address, then unit)', () => {
  it('matches a single home at the address whatever the spelling', () => {
    expect(matchHome(index, '1 TEST WAY.', null)).toEqual({ kind: 'match', propertyId: 'p1' })
  })
  it('a unit the file gives fills a home that has none', () => {
    expect(matchHome(index, '1 Test Way', 'Lot 4')).toEqual({ kind: 'match', propertyId: 'p1' })
  })
  it('tells condo units apart by unit number', () => {
    expect(matchHome(index, '10 Condo Street', '#1')).toEqual({ kind: 'match', propertyId: 'p2' })
    expect(matchHome(index, '10 condo st', 'Unit 2')).toEqual({ kind: 'match', propertyId: 'p3' })
  })
  it('a unit not on file at a multi-unit address is a new home', () => {
    expect(matchHome(index, '10 Condo St', '3')).toEqual({ kind: 'none' })
  })
  it('no unit at a multi-unit address is ambiguous', () => {
    expect(matchHome(index, '10 Condo St', null)).toEqual({ kind: 'ambiguous' })
    expect(matchHome(index, '5 Twin Lane', null)).toEqual({ kind: 'ambiguous' })
  })
  it('an unknown address is a new home', () => {
    expect(matchHome(index, '99 Nowhere Rd', null)).toEqual({ kind: 'none' })
    expect(matchHome(index, '', null)).toEqual({ kind: 'none' })
  })
  it('remember() makes a home created this run matchable; forget() undoes it', () => {
    const i = buildHomeIndex([])
    i.remember('new-1', '7 Fresh Ct', null)
    expect(matchHome(i, '7 fresh court', null)).toEqual({ kind: 'match', propertyId: 'new-1' })
    i.forget('new-1')
    expect(matchHome(i, '7 fresh court', null)).toEqual({ kind: 'none' })
  })
})

describe('pickUnitAtAddress', () => {
  const units = [
    { id: 'u1', unit_number: '1' },
    { id: 'u2', unit_number: 'Unit 2' },
  ]
  it('prefers the matching unit number', () => {
    expect(pickUnitAtAddress(units, '#2')?.id).toBe('u2')
  })
  it('no unit asked → the first (oldest) unit, as before', () => {
    expect(pickUnitAtAddress(units, null)?.id).toBe('u1')
  })
  it('a unit not there → none, unless the only unit has no number', () => {
    expect(pickUnitAtAddress(units, '3')).toBeNull()
    expect(pickUnitAtAddress([{ id: 'u9', unit_number: null }], '3')?.id).toBe('u9')
    expect(pickUnitAtAddress([], null)).toBeNull()
  })
})
