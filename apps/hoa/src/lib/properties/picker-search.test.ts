import { describe, expect, it } from 'vitest'
import { propertyOptionLabel, searchPropertyOptions } from './picker-search'

const opts = [
  { id: 'a', address: '1200 Demo Court', unit_number: null },
  { id: 'b', address: '128 Demo Court', unit_number: 'Unit 2' },
  { id: 'c', address: '13 Demo Court', unit_number: null },
  { id: 'd', address: '7 Sample Way', unit_number: null },
]

describe('searchPropertyOptions', () => {
  it('an empty term lists every home in natural order', () => {
    expect(searchPropertyOptions(opts, '').map((o) => o.id)).toEqual(['d', 'c', 'b', 'a'])
  })
  it('every word must match, in any order, case-insensitively', () => {
    expect(searchPropertyOptions(opts, 'court 12').map((o) => o.id)).toEqual(['b', 'a'])
    expect(searchPropertyOptions(opts, 'SAMPLE').map((o) => o.id)).toEqual(['d'])
  })
  it('matches the unit too', () => {
    expect(searchPropertyOptions(opts, 'unit 2').map((o) => o.id)).toEqual(['b'])
  })
  it('caps the result count', () => {
    expect(searchPropertyOptions(opts, '', 2)).toHaveLength(2)
  })
})

describe('propertyOptionLabel', () => {
  it('appends the unit', () => {
    expect(propertyOptionLabel(opts[1])).toBe('128 Demo Court · Unit 2')
    expect(propertyOptionLabel(opts[0])).toBe('1200 Demo Court')
  })
})
