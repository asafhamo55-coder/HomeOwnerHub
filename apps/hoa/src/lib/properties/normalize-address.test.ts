import { describe, expect, it } from 'vitest'
import { normalizeAddress } from './normalize-address'

describe('normalizeAddress', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeAddress('  214   Oak   Lane  ')).toBe('214 oak ln')
  })

  it('strips punctuation', () => {
    expect(normalizeAddress('214 Oak Ln.')).toBe('214 oak ln')
    expect(normalizeAddress('214 Oak Ln,')).toBe('214 oak ln')
  })

  it('treats street-type abbreviations as equivalent', () => {
    const expected = '214 oak ln'
    expect(normalizeAddress('214 Oak Lane')).toBe(expected)
    expect(normalizeAddress('214 Oak Ln')).toBe(expected)
    expect(normalizeAddress('214 OAK LN.')).toBe(expected)
  })

  it('normalizes every supported street type', () => {
    expect(normalizeAddress('1 A Street')).toBe('1 a st')
    expect(normalizeAddress('1 A Court')).toBe('1 a ct')
    expect(normalizeAddress('1 A Drive')).toBe('1 a dr')
    expect(normalizeAddress('1 A Road')).toBe('1 a rd')
    expect(normalizeAddress('1 A Avenue')).toBe('1 a ave')
    expect(normalizeAddress('1 A Boulevard')).toBe('1 a blvd')
    expect(normalizeAddress('1 A Circle')).toBe('1 a cir')
    expect(normalizeAddress('1 A Place')).toBe('1 a pl')
    expect(normalizeAddress('1 A Terrace')).toBe('1 a ter')
    expect(normalizeAddress('1 A Trail')).toBe('1 a trl')
    expect(normalizeAddress('1 A Way')).toBe('1 a way')
  })

  it('only rewrites a street type in the final position', () => {
    // "Court" here is part of the street NAME, not a suffix.
    expect(normalizeAddress('12 Court Street')).toBe('12 court st')
  })

  it('preserves unit designators', () => {
    expect(normalizeAddress('214 Oak Ln #3')).toBe('214 oak ln 3')
    expect(normalizeAddress('214 Oak Ln Apt 3')).toBe('214 oak ln apt 3')
  })

  it('returns empty string for nullish or blank input', () => {
    expect(normalizeAddress(null)).toBe('')
    expect(normalizeAddress(undefined)).toBe('')
    expect(normalizeAddress('   ')).toBe('')
  })
})
