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
})
