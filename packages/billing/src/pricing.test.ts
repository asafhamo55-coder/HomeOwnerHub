import { describe, expect, it } from 'vitest'
import {
  ANNUAL_UNIT_CENTS,
  MONTHLY_UNIT_CENTS,
  PRICING,
  annualCostCents,
  annualCostUsd,
  annualSavingsUsd,
  billableDoors,
  billingSummary,
  formatUsd,
  minimumMonthlyUsd,
  monthlyCostCents,
  monthlyCostUsd,
} from './pricing'

// The rounding gap BL-042 found: the in-app annual price was derived as
// round2(monthly × 12 × 0.9) — $9,700.56 at 180 doors — while Stripe
// charges the annual Price's unit_amount × quantity: 5388¢ × 180 =
// $9,698.40. Every displayed total must be the Stripe arithmetic.

const DOORS = [25, 41, 50, 180, 400]

describe('Stripe unit amounts', () => {
  it('are the cents the setup route creates the Prices with (and checkout charges)', () => {
    expect(MONTHLY_UNIT_CENTS).toBe(499)
    expect(ANNUAL_UNIT_CENTS).toBe(5388)
    expect(PRICING.PER_DOOR_USD).toBe(4.99)
  })

  it('the minimum is 41 doors, $204.59 a month', () => {
    expect(billableDoors(1)).toBe(41)
    expect(billableDoors(40)).toBe(41)
    expect(billableDoors(41)).toBe(41)
    expect(billableDoors(42)).toBe(42)
    expect(minimumMonthlyUsd()).toBe(204.59)
  })
})

describe.each(DOORS)('%i doors', (doors) => {
  const qty = billableDoors(doors)

  it('monthly total = unit_amount × quantity', () => {
    expect(monthlyCostCents(doors)).toBe(MONTHLY_UNIT_CENTS * qty)
    expect(Math.round(monthlyCostUsd(doors) * 100)).toBe(MONTHLY_UNIT_CENTS * qty)
    expect(billingSummary(doors).monthlyCents).toBe(MONTHLY_UNIT_CENTS * qty)
  })

  it('annual total = unit_amount × quantity', () => {
    expect(annualCostCents(doors)).toBe(ANNUAL_UNIT_CENTS * qty)
    expect(Math.round(annualCostUsd(doors) * 100)).toBe(ANNUAL_UNIT_CENTS * qty)
    expect(billingSummary(doors).annualCents).toBe(ANNUAL_UNIT_CENTS * qty)
  })

  it('savings are the difference of the two charged totals', () => {
    expect(Math.round(annualSavingsUsd(doors) * 100)).toBe(MONTHLY_UNIT_CENTS * qty * 12 - ANNUAL_UNIT_CENTS * qty)
  })

  it('the formatted strings show the exact charged cents', () => {
    const s = billingSummary(doors)
    expect(formatUsd(s.monthlyUsd, { withCents: true })).toBe(
      ((MONTHLY_UNIT_CENTS * qty) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    )
    expect(formatUsd(s.annualUsd, { withCents: true })).toBe(
      ((ANNUAL_UNIT_CENTS * qty) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    )
  })
})

describe('the case BL-042 caught', () => {
  it('180 doors annual is $9,698.40, not $9,700.56', () => {
    expect(formatUsd(annualCostUsd(180), { withCents: true })).toBe('$9,698.40')
  })
  it('25 doors bills the 41-door minimum: $204.59 / month, $2,209.08 / year', () => {
    const s = billingSummary(25)
    expect(s.minApplied).toBe(true)
    expect(s.billableDoors).toBe(41)
    expect(formatUsd(s.monthlyUsd, { withCents: true })).toBe('$204.59')
    expect(formatUsd(s.annualUsd, { withCents: true })).toBe('$2,209.08')
  })
})
