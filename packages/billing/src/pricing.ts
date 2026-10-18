// HOA Hub pricing — single source of truth.
//
// All UIs (settings/billing, tenant-edit) and all server logic (checkout
// quantity, the Stripe Price setup route) read from this module so a price
// change is one constant away.
//
// Model:
//   - $4.99 per door per month (the monthly Stripe Price, 499¢)
//   - $53.88 per door per year (the annual Stripe Price, 5388¢ —
//     $4.99 × 12 × 0.9, the 10% annual discount baked in)
//   - a door minimum: checkout bills at least ceil($200 / $4.99) = 41
//     doors, so the smallest monthly bill is $204.59
//   - First year is committed — Cancellation requests are honored from
//     month 13 onward.
//
// Every displayed total is Stripe's own arithmetic: unit_amount (cents)
// × quantity (billable doors). Deriving the annual total from the monthly
// one (monthly × 12 × 0.9) drifted from what Stripe charges — $9,700.56
// shown vs $9,698.40 charged at 180 doors (BL-042). Totals are computed
// in integer cents and only divided by 100 for display.

/** The monthly Stripe Price's unit_amount, in cents, per door. */
export const MONTHLY_UNIT_CENTS = 499
/** The annual Stripe Price's unit_amount, in cents, per door. */
export const ANNUAL_UNIT_CENTS = 5388

export const PRICING = {
  /** USD per door per month (the monthly Stripe Price). */
  PER_DOOR_USD: MONTHLY_UNIT_CENTS / 100,
  /** The floor the door minimum is derived from. The real minimum bill is minimumMonthlyUsd(). */
  MIN_MONTHLY_USD: 200,
  /** Discount % on the annual prepay (already inside ANNUAL_UNIT_CENTS). */
  ANNUAL_DISCOUNT_PCT: 10,
  /** Number of months the customer is committed for. */
  COMMIT_MONTHS: 12,
} as const

/** Doors checkout bills (the Stripe quantity) — never below the minimum. */
export function billableDoors(doors: number): number {
  const minDoors = Math.ceil((PRICING.MIN_MONTHLY_USD * 100) / MONTHLY_UNIT_CENTS)
  return Math.max(doors, minDoors)
}

/** Monthly bill in cents: monthly unit_amount × quantity. */
export function monthlyCostCents(doors: number): number {
  return MONTHLY_UNIT_CENTS * billableDoors(doors)
}

/** Annual bill in cents: annual unit_amount × quantity. */
export function annualCostCents(doors: number): number {
  return ANNUAL_UNIT_CENTS * billableDoors(doors)
}

/** Monthly bill in USD, exactly what Stripe charges. */
export function monthlyCostUsd(doors: number): number {
  return monthlyCostCents(doors) / 100
}

/** Annual bill in USD, exactly what Stripe charges. */
export function annualCostUsd(doors: number): number {
  return annualCostCents(doors) / 100
}

/** Annual savings = 12 monthly bills − the annual bill. */
export function annualSavingsUsd(doors: number): number {
  return (monthlyCostCents(doors) * 12 - annualCostCents(doors)) / 100
}

/** The smallest monthly bill: the minimum door count × $4.99 ($204.59). */
export function minimumMonthlyUsd(): number {
  return monthlyCostUsd(0)
}

export interface BillingSummary {
  doors: number
  /** Doors actually billed (max of input and the minimum) — the Stripe quantity. */
  billableDoors: number
  monthlyCents: number
  annualCents: number
  monthlyUsd: number
  annualUsd: number
  annualSavingsUsd: number
  /** True when input doors fell below the floor; used to show the
   *  "minimum applies" note in the UI. */
  minApplied: boolean
}

export function billingSummary(doors: number): BillingSummary {
  const billable = billableDoors(doors)
  return {
    doors,
    billableDoors: billable,
    monthlyCents: monthlyCostCents(doors),
    annualCents: annualCostCents(doors),
    monthlyUsd: monthlyCostUsd(doors),
    annualUsd: annualCostUsd(doors),
    annualSavingsUsd: annualSavingsUsd(doors),
    minApplied: billable > doors,
  }
}

/** USD formatter for display. */
export function formatUsd(value: number, opts?: { withCents?: boolean }): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts?.withCents ? 2 : 0,
    maximumFractionDigits: opts?.withCents ? 2 : 0,
  })
}
