import { describe, expect, it } from 'vitest'
import { resendSummary } from './resend-summary'

describe('resendSummary (BL-109)', () => {
  it('all held: nothing resent, held named — never "failing"', () => {
    expect(resendSummary({ sentCount: 0, failedCount: 0, heldCount: 3 })).toBe('Nothing was resent; held by safety guard (3).')
  })
  it('mixed held + delivered: reports both', () => {
    expect(resendSummary({ sentCount: 2, failedCount: 0, heldCount: 1 })).toBe('Resent to 2 recipients; held by safety guard (1).')
  })
  it('a real failure stays a failure', () => {
    expect(resendSummary({ sentCount: 0, failedCount: 2, heldCount: 0 })).toBe('Nothing was resent; 2 still failing.')
    expect(resendSummary({ sentCount: 1, failedCount: 1, heldCount: 0 })).toBe('Resent to 1 recipient; 1 still failing.')
  })
})
