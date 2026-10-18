import { describe, expect, it } from 'vitest'
import { SECTIONS, parseSection } from './sections'

describe('parseSection', () => {
  it('accepts every section', () => {
    for (const s of SECTIONS) expect(parseSection(s)).toBe(s)
  })
  it('old tab links land on the section that replaced the tab', () => {
    expect(parseSection('overview')).toBe('people')
    expect(parseSection('residents')).toBe('people')
    expect(parseSection('dues')).toBe('money')
    expect(parseSection('collections')).toBe('money')
    expect(parseSection('violations')).toBe('compliance')
    expect(parseSection('mail')).toBe('communications')
    expect(parseSection('history')).toBe('activity')
  })
  it('defaults to People', () => {
    expect(parseSection(undefined)).toBe('people')
    expect(parseSection('nonsense')).toBe('people')
  })
})
