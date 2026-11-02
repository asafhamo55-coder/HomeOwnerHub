import { describe, expect, it } from 'vitest'
import { isExpired, methodExpiry, methodLabel } from './saved-methods'

describe('saved method wording', () => {
  it('labels cards and banks in plain words', () => {
    expect(methodLabel({ method_type: 'card', brand: 'visa', last4: '4242' })).toBe('Visa ending 4242')
    expect(methodLabel({ method_type: 'ach', brand: 'bank of america', last4: '4821' })).toBe('Bank Of America ending 4821')
    expect(methodLabel({ method_type: 'ach', brand: null, last4: null })).toBe('Bank account')
  })

  it('formats expiry and detects expired cards at the end of the month', () => {
    expect(methodExpiry({ exp_month: 8, exp_year: 2027 })).toBe('Expires 08/2027')
    expect(methodExpiry({ exp_month: null, exp_year: null })).toBeNull()
    const c = { exp_month: 8, exp_year: 2027 }
    expect(isExpired(c, new Date('2027-08-31T12:00:00Z'))).toBe(false)
    expect(isExpired(c, new Date('2027-09-01T00:00:00Z'))).toBe(true)
  })
})
