import { describe, expect, it } from 'vitest'
import {
  ACH_FEE_CAP_CENTS,
  ACH_FEE_FLOOR_CENTS,
  CARD_FEE_MAX_CENTS,
  DEFAULT_FEE_POLICY,
  MAX_DUES_CENTS,
  SURCHARGE_BLOCKED_STATES,
  baseFeeCents,
  computeOnlinePaymentFees,
  isSurchargeBlockedState,
  resolveFeePayer,
  stripeCostEstimateCents,
  type FeePolicy,
  type PaymentMethodKind,
} from './fees'

const ack: FeePolicy = { ...DEFAULT_FEE_POLICY, cardFeeAcknowledged: true }
const METHODS: PaymentMethodKind[] = ['ach', 'credit_card', 'debit_card']
const PAYERS = ['association', 'homeowner'] as const

describe('defaults (design recommendations, OA-42 undecided)', () => {
  it('association pays ACH, homeowner pays card, card fee off until acknowledged', () => {
    expect(DEFAULT_FEE_POLICY.achFeePayer).toBe('association')
    expect(DEFAULT_FEE_POLICY.cardFeePayer).toBe('homeowner')
    expect(DEFAULT_FEE_POLICY.cardFeeAcknowledged).toBe(false)
  })
  it('card fee is forced onto the association until acknowledged', () => {
    const r = computeOnlinePaymentFees('credit_card', 25000)
    expect(r.feePayer).toBe('association')
    expect(r.payerReason).toBe('not_acknowledged')
    expect(r.grossCents).toBe(25000)
  })
})

describe('card, homeowner pays (3.0% + $0.50)', () => {
  it('$250.00 dues', () => {
    const r = computeOnlinePaymentFees('credit_card', 25000, ack)
    expect(r.feePayer).toBe('homeowner')
    expect(r.feeCents).toBe(800)
    expect(r.grossCents).toBe(25800)
    expect(r.stripeCostEstimateCents).toBe(778) // 2.9% of 258.00 = 7.482 -> 7.48, + 0.30
    expect(r.applicationFeeCents).toBe(22)
    expect(r.netToHoaCents).toBe(25000)
  })
  it('rounds the percentage half up', () => {
    // 3% of 1,050 cents = 31.5 -> 32, plus 50
    expect(baseFeeCents('credit_card', 1050)).toBe(82)
    // 3% of 1,016 = 30.48 -> 30
    expect(baseFeeCents('credit_card', 1016)).toBe(80)
  })
})

describe('card, association pays', () => {
  const pol: FeePolicy = { ...ack, cardFeePayer: 'association' }
  it('charge equals dues and the fee comes out of the payout', () => {
    const r = computeOnlinePaymentFees('credit_card', 25000, pol)
    expect(r.grossCents).toBe(25000)
    expect(r.feeChargedToPayerCents).toBe(0)
    expect(r.feeCents).toBe(800)
    expect(r.stripeCostEstimateCents).toBe(755) // 725 + 30
    expect(r.applicationFeeCents).toBe(45)
    expect(r.netToHoaCents).toBe(25000 - 800)
  })
})

describe('debit cards', () => {
  it('carry no surcharge when the homeowner would pay; association bears Stripe cost', () => {
    const r = computeOnlinePaymentFees('debit_card', 25000, ack)
    expect(r.feePayer).toBe('homeowner')
    expect(r.payerReason).toBe('debit_exempt')
    expect(r.feeCents).toBe(0)
    expect(r.grossCents).toBe(25000)
    expect(r.applicationFeeCents).toBe(0)
    expect(r.netToHoaCents).toBe(25000 - r.stripeCostEstimateCents)
  })
  it('are priced like a card when the association pays the card fee', () => {
    const r = computeOnlinePaymentFees('debit_card', 25000, { ...ack, cardFeePayer: 'association' })
    expect(r.feeCents).toBe(800)
    expect(r.grossCents).toBe(25000)
  })
})

describe('ACH scaled model ($2.45 up to $5.45)', () => {
  it('association pays by default: $250 dues', () => {
    const r = computeOnlinePaymentFees('ach', 25000)
    expect(r.feePayer).toBe('association')
    expect(r.feeCents).toBe(245)
    expect(r.grossCents).toBe(25000)
    expect(r.stripeCostEstimateCents).toBe(200)
    expect(r.applicationFeeCents).toBe(45)
    expect(r.netToHoaCents).toBe(24755)
  })
  it('is the floor up to about $256', () => {
    expect(baseFeeCents('ach', 20000)).toBe(ACH_FEE_FLOOR_CENTS)
    expect(baseFeeCents('ach', 25600)).toBe(250) // stripe 205 + 45
    expect(baseFeeCents('ach', 25000)).toBe(245)
  })
  it('scales above the break-even and never loses money (the $400 case)', () => {
    const r = computeOnlinePaymentFees('ach', 40000)
    expect(r.feeCents).toBe(365) // 320 + 45
    expect(r.applicationFeeCents).toBe(45)
    expect(r.applicationFeeCents).toBeGreaterThan(0)
  })
  it('caps at $5.45 for large payments (Stripe caps its own fee at $5.00)', () => {
    for (const dues of [62500, 100000, 1_000_000, MAX_DUES_CENTS]) {
      const r = computeOnlinePaymentFees('ach', dues)
      expect(r.feeCents).toBe(ACH_FEE_CAP_CENTS)
      expect(r.stripeCostEstimateCents).toBe(500)
    }
  })
  it('homeowner pays: gross is dues + fee and the association nets dues', () => {
    const r = computeOnlinePaymentFees('ach', 25000, { ...DEFAULT_FEE_POLICY, achFeePayer: 'homeowner' })
    expect(r.grossCents).toBe(25245)
    expect(r.netToHoaCents).toBe(25000)
  })
})

describe('edge cases', () => {
  it('$0.01 ACH: association pays, fee cannot exceed what the charge carries', () => {
    const r = computeOnlinePaymentFees('ach', 1)
    expect(r.feeCents).toBe(245)
    expect(r.grossCents).toBe(1)
    expect(r.applicationFeeCents).toBeLessThanOrEqual(r.grossCents)
    expect(r.applicationFeeCents).toBe(1)
    expect(r.netToHoaCents).toBe(0)
  })
  it('$0.01 ACH: homeowner pays the whole fee and the association nets one cent', () => {
    const r = computeOnlinePaymentFees('ach', 1, { ...DEFAULT_FEE_POLICY, achFeePayer: 'homeowner' })
    expect(r.grossCents).toBe(246)
    expect(r.netToHoaCents).toBe(1)
  })
  it('$0.01 card: homeowner pays, nets one cent; association pays, application fee is clamped to 0', () => {
    const h = computeOnlinePaymentFees('credit_card', 1, ack)
    expect(h.feeCents).toBe(50)
    expect(h.grossCents).toBe(51)
    expect(h.netToHoaCents).toBe(1)
    const a = computeOnlinePaymentFees('credit_card', 1, { ...ack, cardFeePayer: 'association' })
    expect(a.applicationFeeCents).toBe(0)
  })
  it('large amounts stay exact integers', () => {
    const r = computeOnlinePaymentFees('credit_card', MAX_DUES_CENTS, ack)
    expect(Number.isSafeInteger(r.grossCents)).toBe(true)
    expect(r.feeCents).toBe(CARD_FEE_MAX_CENTS)
    // the hard cap bites: Stripe's cost exceeds the capped fee, so we take nothing and the HOA bears the rest
    expect(r.applicationFeeCents).toBe(0)
    expect(r.netToHoaCents).toBe(r.grossCents - r.stripeCostEstimateCents)
  })
  it('rejects non-integers, zero, negatives and over-limit amounts', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, MAX_DUES_CENTS + 1]) {
      expect(() => computeOnlinePaymentFees('ach', bad)).toThrow(RangeError)
    }
  })
})

describe('blocked states', () => {
  it('matches case-insensitively and ignores empty state', () => {
    expect(isSurchargeBlockedState('ma')).toBe(true)
    expect(isSurchargeBlockedState(' CT ')).toBe(true)
    expect(isSurchargeBlockedState('GA')).toBe(false)
    expect(isSurchargeBlockedState(null)).toBe(false)
    expect(isSurchargeBlockedState('')).toBe(false)
  })
  it.each(SURCHARGE_BLOCKED_STATES)('%s forces the association to pay the card fee', (state) => {
    const r = computeOnlinePaymentFees('credit_card', 25000, { ...ack, state })
    expect(r.feePayer).toBe('association')
    expect(r.payerReason).toBe('blocked_state')
    expect(r.grossCents).toBe(25000)
    const d = computeOnlinePaymentFees('debit_card', 25000, { ...ack, state })
    expect(d.grossCents).toBe(25000)
  })
  it('does not affect ACH or Georgia', () => {
    expect(computeOnlinePaymentFees('ach', 25000, { ...ack, achFeePayer: 'homeowner', state: 'MA' }).feePayer).toBe('homeowner')
    expect(computeOnlinePaymentFees('credit_card', 25000, { ...ack, state: 'GA' }).feePayer).toBe('homeowner')
  })
  it('resolveFeePayer reports the reason', () => {
    expect(resolveFeePayer('credit_card', { ...ack, state: 'CT' })).toEqual({ payer: 'association', reason: 'blocked_state' })
  })
})

describe('invariants over a sweep of amounts, methods and payers', () => {
  const amounts = [1, 2, 3, 49, 50, 99, 100, 101, 999, 1050, 2499, 4999, 10000, 24999, 25000, 25600, 30600, 39999, 40000, 62499, 62500, 99999, 123457, 500000, 1_000_000, 4_999_999, 99_999_999, MAX_DUES_CENTS]
  for (const method of METHODS) {
    for (const achFeePayer of PAYERS) {
      for (const cardFeePayer of PAYERS) {
        it(`${method} ach:${achFeePayer} card:${cardFeePayer}`, () => {
          const pol: FeePolicy = { achFeePayer, cardFeePayer, cardFeeAcknowledged: true, state: 'GA' }
          for (const dues of amounts) {
            const r = computeOnlinePaymentFees(method, dues, pol)
            for (const v of [r.feeCents, r.grossCents, r.stripeCostEstimateCents, r.applicationFeeCents, r.feeChargedToPayerCents]) {
              expect(Number.isSafeInteger(v)).toBe(true)
              expect(v).toBeGreaterThanOrEqual(0)
            }
            // total = dues + fee actually charged
            expect(r.grossCents).toBe(dues + (r.feePayer === 'homeowner' ? r.feeCents : 0))
            // our fee is never negative, never above the fee itself or the charge after Stripe's cut
            expect(r.applicationFeeCents).toBeLessThanOrEqual(r.feeCents)
            expect(r.applicationFeeCents).toBeLessThanOrEqual(Math.max(0, r.grossCents - r.stripeCostEstimateCents))
            // fee caps
            if (method === 'ach') expect(r.feeCents).toBeLessThanOrEqual(ACH_FEE_CAP_CENTS)
            else expect(r.feeCents).toBeLessThanOrEqual(CARD_FEE_MAX_CENTS)
            if (method === 'ach') expect(r.feeCents).toBeGreaterThanOrEqual(ACH_FEE_FLOOR_CENTS)
            // net accounting identity
            expect(r.netToHoaCents).toBe(r.grossCents - r.stripeCostEstimateCents - r.applicationFeeCents)
            // when the homeowner pays and the fee covers Stripe's cost, the association nets exactly the dues
            if (r.feePayer === 'homeowner' && r.feeCents >= r.stripeCostEstimateCents) {
              expect(r.netToHoaCents).toBe(dues)
            }
          }
        })
      }
    }
  }

  it('stripe estimate: card 2.9% + 30c, ACH 0.8% capped at $5', () => {
    expect(stripeCostEstimateCents('credit_card', 10000)).toBe(320)
    expect(stripeCostEstimateCents('ach', 10000)).toBe(80)
    expect(stripeCostEstimateCents('ach', 10_000_000)).toBe(500)
    expect(stripeCostEstimateCents('ach', 1)).toBe(0)
  })
})
