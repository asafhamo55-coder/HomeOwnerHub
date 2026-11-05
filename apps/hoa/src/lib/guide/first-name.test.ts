import { describe, expect, it } from 'vitest'
import { firstNameOf, helpGreeting } from './first-name'

describe('firstNameOf', () => {
  it('takes the first word', () => {
    expect(firstNameOf('Asaf')).toBe('Asaf')
    expect(firstNameOf('Asaf Hamo')).toBe('Asaf')
    expect(firstNameOf('  Mary Ann  Smith ')).toBe('Mary')
  })
  it('is null when the first token is an email address', () => {
    expect(firstNameOf('jane@x.com')).toBeNull()
    expect(firstNameOf('  jane@x.com Smith')).toBeNull()
    expect(helpGreeting('jane@x.com')).toBeNull()
  })
  it('caps a long name at 30 characters', () => {
    expect(firstNameOf('A'.repeat(80))).toBe('A'.repeat(30))
    expect(firstNameOf('A'.repeat(30))).toBe('A'.repeat(30))
  })
  it('is null for blank, whitespace or missing', () => {
    expect(firstNameOf('')).toBeNull()
    expect(firstNameOf('   \t ')).toBeNull()
    expect(firstNameOf(null)).toBeNull()
    expect(firstNameOf(undefined)).toBeNull()
  })
})

describe('helpGreeting', () => {
  it('greets without a comma', () => {
    expect(helpGreeting('Asaf Hamo')).toBe('Hello Asaf')
  })
  it('is null when there is no name, so callers keep "Help"', () => {
    expect(helpGreeting('  ')).toBeNull()
    expect(helpGreeting(null)).toBeNull()
  })
})
