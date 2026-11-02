import { describe, expect, it } from 'vitest'
import { AUTOPAY_AUTHORIZATION_VERSION, authorizationText, parseMaxDollars, suggestedMaxCents } from './autopay'

describe('autopay wording and limits', () => {
  it('prefills regular dues plus 25 percent, rounded up to whole dollars', () => {
    expect(suggestedMaxCents(25000)).toBe(31300)
    expect(suggestedMaxCents(0)).toBe(10000)
  })
  it('parses what an owner types', () => {
    expect(parseMaxDollars('300')).toBe(30000)
    expect(parseMaxDollars('$1,250.5')).toBe(125050)
    expect(parseMaxDollars('0.50')).toBeNull()
    expect(parseMaxDollars('50001')).toBeNull()
    expect(parseMaxDollars('abc')).toBeNull()
  })
  it('the stored version reproduces the exact wording; unknown versions return null', () => {
    const t = authorizationText(AUTOPAY_AUTHORIZATION_VERSION, 30000, 'bank account ending 4821')
    expect(t?.join(' ')).toContain('never take more than $300')
    expect(t?.join(' ')).not.toMatch(/—/)
    expect(authorizationText('autopay-0', 30000, 'x')).toBeNull()
  })
})
