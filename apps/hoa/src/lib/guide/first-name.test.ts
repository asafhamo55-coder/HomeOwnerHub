import { describe, expect, it } from 'vitest'
import { firstNameOf, helpGreeting } from './first-name'

describe('firstNameOf', () => {
  it('takes the first word', () => {
    expect(firstNameOf('Asaf')).toBe('Asaf')
    expect(firstNameOf('Asaf Hamo')).toBe('Asaf')
    expect(firstNameOf('  Mary Ann  Smith ')).toBe('Mary')
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
