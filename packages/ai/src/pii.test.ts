import { describe, expect, it } from 'vitest'
import { findContactPII, redactContactPII } from './pii'

describe('findContactPII', () => {
  it('finds emails and the usual US phone shapes', () => {
    const text =
      'Mail pat.owner+hoa@example.co.uk, call (305) 555-0142, 305.555.0143, +1 305 555 0144, 3055550145 or 555-0100.'
    expect(findContactPII(text)).toEqual([
      'pat.owner+hoa@example.co.uk',
      '(305) 555-0142',
      '305.555.0143',
      '+1 305 555 0144',
      '3055550145',
      '555-0100',
    ])
  })

  it('does not flag dates, cents, ids or contact placeholders', () => {
    const text =
      'Due 2026-03-01, $1,234 (123400 cents), lot 12, run 6f1c2a9e-0b1d-4c7e-9a55-1d2e3f4a5b6c, [OWNER_EMAIL_1] [OWNER_PHONE_2]'
    expect(findContactPII(text)).toEqual([])
  })
})

describe('redactContactPII', () => {
  it('replaces every email and phone, keeping the rest of the text', () => {
    const out = redactContactPII('Hi, my fence is down.\n--\nPat Owner\npat@example.com | (305) 555-0142')
    expect(out).toBe('Hi, my fence is down.\n--\nPat Owner\n[email removed] | [phone removed]')
    expect(findContactPII(out)).toEqual([])
  })

  it('leaves dates and amounts alone', () => {
    expect(redactContactPII('Paid $1,234 on 2026-03-01.')).toBe('Paid $1,234 on 2026-03-01.')
  })

  it('redacts US street addresses (SEC-005)', () => {
    const cases: Array<[string, string]> = [
      ['I live at 829 Pistace Ct and want a fence', 'I live at [address removed] and want a fence'],
      ['1600 Pennsylvania Avenue NW, Washington', '[address removed], Washington'],
      ['my home 12 N. Oak Ln. needs paint', 'my home [address removed] needs paint'],
      ['4521B Old Mill Rd', '[address removed]'],
      ['at 77 Sunset Harbor Blvd', 'at [address removed]'],
      ['lowercase 15 maple street too', 'lowercase [address removed] too'],
    ]
    for (const [input, out] of cases) expect(redactContactPII(input)).toBe(out)
  })

  it('redacts unit numbers (SEC-005)', () => {
    expect(redactContactPII('Apt 4B leaks')).toBe('[unit removed] leaks')
    expect(redactContactPII('in unit 12, near suite 300 and Ste. 2 or apt #4-A')).toBe(
      'in [unit removed], near [unit removed] and [unit removed] or [unit removed]',
    )
    expect(redactContactPII('22 Elm St Apt 3')).toBe('[address removed] [unit removed]')
  })

  it('keeps rules questions intact: no address or unit without both parts', () => {
    for (const q of [
      'Can I have 2 dogs on my street?',
      'Is a 6 ft fence allowed in the back yard?',
      'Can I park 3 cars in the driveway?',
      'Does my unit allow a hot tub?',
      'What does Section 4.2 say about the street trees?',
      'Rule 12 on parking',
      'Paid $1,234 for 2 units',
    ]) {
      expect(redactContactPII(q)).toBe(q)
    }
  })

  it('does not attempt free-form names (documented limitation)', () => {
    expect(redactContactPII('My neighbour Pat Owner is loud')).toBe('My neighbour Pat Owner is loud')
  })

  it('findContactPII still flags only email and phone', () => {
    expect(findContactPII('829 Pistace Ct, Apt 4B')).toEqual([])
  })
})
