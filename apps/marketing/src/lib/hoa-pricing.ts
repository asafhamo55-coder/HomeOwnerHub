// HOA Hub pricing as the marketing site shows it. ONE source for /pricing,
// the homepage pricing teaser, /compare, the ROI calculator and the demo FAQ.
//
// It mirrors what Stripe checkout charges TODAY:
//   - packages/billing/src/pricing.ts (door count, minimum, discount, term)
//   - apps/hoa/src/app/api/admin/setup-stripe-pricing/route.ts (the cent
//     amounts on the two Stripe Prices)
// hoa-pricing.test.ts pins every number here against both, and fails if a
// page types an HOA price by hand. Kept literal because the marketing app
// doesn't depend on @homeowner-portal/billing (it pulls in stripe and db).
//
// Decided prices that checkout does NOT charge yet (BL-068 per-module
// plans) must not appear here. See
// docs/decisions/2026-10-18-marketing-pricing-truth.md.

export const HOA_PRICING = {
  /** USD per door per month. */
  PER_DOOR_USD: 4.99,
  /** The floor billing aims for. Checkout rounds the door count UP, so the real minimum is MIN_MONTHLY_BILL_USD. */
  MIN_MONTHLY_USD: 200,
  /** Percent off when paying a year up front. */
  ANNUAL_DISCOUNT_PCT: 10,
  /** First-year term: both cadences can't be cancelled before month 13. */
  COMMIT_MONTHS: 12,
} as const

/** The annual Stripe Price: $4.99 x 12 x 0.9, per door per year, as configured (5388 cents). */
export const ANNUAL_PER_DOOR_YEARLY_USD = 53.88

/** Doors checkout bills: never fewer than ceil(minimum / per-door). Same as packages/billing. */
export function billableDoors(doors: number): number {
  const minDoors = Math.ceil(HOA_PRICING.MIN_MONTHLY_USD / HOA_PRICING.PER_DOOR_USD)
  return Math.max(doors, minDoors)
}

/** Monthly bill in USD on the monthly plan. */
export function monthlyBillUsd(doors: number): number {
  return round2(billableDoors(doors) * HOA_PRICING.PER_DOOR_USD)
}

/** Yearly bill in USD on the annual plan: billable doors x the annual Price. */
export function annualBillUsd(doors: number): number {
  return Math.round(billableDoors(doors) * ANNUAL_PER_DOOR_YEARLY_USD * 100) / 100
}

export const MIN_BILLABLE_DOORS = billableDoors(1)
export const MIN_MONTHLY_BILL_USD = monthlyBillUsd(1)

/** Annual plan expressed per door per month, for side-by-side display. */
const ANNUAL_PER_DOOR_MONTHLY_USD = Math.floor((ANNUAL_PER_DOOR_YEARLY_USD / 12) * 100) / 100

export function formatUsd(value: number, opts?: { withCents?: boolean }): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts?.withCents ? 2 : 0,
    maximumFractionDigits: opts?.withCents ? 2 : 0,
  })
}

const perDoor = formatUsd(HOA_PRICING.PER_DOOR_USD, { withCents: true })
const minimum = `${MIN_BILLABLE_DOORS}-door minimum (${formatUsd(MIN_MONTHLY_BILL_USD, { withCents: true })}/mo)`
const term = `first ${HOA_PRICING.COMMIT_MONTHS} months committed`

export const HOA_PRICE_COPY = {
  perDoor,
  minimum,
  term,
  /** One sentence for teasers, metadata and FAQs. */
  summary: `${perDoor} per door per month, ${minimum}. ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% off when you pay for the year.`,
  /** Short form for page titles. */
  title: `${perDoor} per door per month`,
} as const

export interface HoaPlan {
  cadence: 'monthly' | 'annual'
  name: string
  price: string
  period: string
  sub: string
  cta: string
  featured?: boolean
}

/** The two plans checkout sells. Same product; only the cadence differs. */
export const HOA_PLANS: readonly HoaPlan[] = [
  {
    cadence: 'monthly',
    name: 'HOA Monthly',
    price: perDoor,
    period: '/door · mo',
    sub: `${minimum} · billed monthly · ${term}`,
    cta: 'Start monthly',
  },
  {
    cadence: 'annual',
    name: 'HOA Annual',
    price: formatUsd(ANNUAL_PER_DOOR_MONTHLY_USD, { withCents: true }),
    period: '/door · mo',
    sub: `Save ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% · billed yearly (${formatUsd(ANNUAL_PER_DOOR_YEARLY_USD, { withCents: true })}/door) · ${term}`,
    cta: `Save ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% annually`,
    featured: true,
  },
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
