import { describe, expect, it } from 'vitest'
import {
  RETURNED_FEE_CAP_CENTS,
  dollars,
  effectiveReturnedFeeCents,
  isFullRefund,
  ledgerCentsForStripeRefund,
  refundableCents,
  shouldReturnApplicationFee,
  stripeRefundCents,
} from './reversal-rules'

describe('returned payment fee', () => {
  it('is off by default', () => {
    expect(effectiveReturnedFeeCents(null)).toBe(0)
    expect(effectiveReturnedFeeCents(undefined)).toBe(0)
    expect(effectiveReturnedFeeCents(0)).toBe(0)
    expect(effectiveReturnedFeeCents(-500)).toBe(0)
    expect(effectiveReturnedFeeCents(12.5)).toBe(0)
  })
  it('passes a board setting and caps it at $30', () => {
    expect(effectiveReturnedFeeCents(2500)).toBe(2500)
    expect(effectiveReturnedFeeCents(3000)).toBe(3000)
    expect(effectiveReturnedFeeCents(10000)).toBe(RETURNED_FEE_CAP_CENTS)
  })
})

describe('our fee on refunds', () => {
  const full = { refundCents: 25000, postedCents: 25000, reversedCents: 0 }
  it('is returned on a full refund', () => {
    expect(isFullRefund(full)).toBe(true)
    expect(shouldReturnApplicationFee(full)).toBe(true)
  })
  it('is kept on a partial refund', () => {
    expect(shouldReturnApplicationFee({ ...full, refundCents: 10000 })).toBe(false)
  })
  it('is kept when the last piece finishes an earlier partial', () => {
    expect(shouldReturnApplicationFee({ refundCents: 15000, postedCents: 25000, reversedCents: 10000 })).toBe(false)
  })
  it('a full refund also returns a fee the homeowner paid', () => {
    expect(stripeRefundCents(full, { feePayer: 'homeowner', feeCents: 800 })).toBe(25800)
    expect(stripeRefundCents(full, { feePayer: 'association', feeCents: 245 })).toBe(25000)
    expect(stripeRefundCents({ ...full, refundCents: 5000 }, { feePayer: 'homeowner', feeCents: 800 })).toBe(5000)
  })
})

describe('ledger amounts', () => {
  it('caps a Stripe refund to the dues still on the books', () => {
    expect(ledgerCentsForStripeRefund(25800, 25000, 0)).toBe(25000)
    expect(ledgerCentsForStripeRefund(5000, 25000, 22000)).toBe(3000)
    expect(ledgerCentsForStripeRefund(5000, 25000, 25000)).toBe(0)
    expect(refundableCents(100, 300)).toBe(0)
  })
  it('formats dollars from cents', () => {
    expect(dollars(0)).toBe('$0.00')
    expect(dollars(5)).toBe('$0.05')
    expect(dollars(123456)).toBe('$1,234.56')
  })
})
