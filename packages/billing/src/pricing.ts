// HOA Hub pricing — single source of truth.
//
// All UIs (settings/billing, marketing /pricing, ROI calculator,
// tenant-edit) and all server logic (checkout quantity calc, monthly
// cost display, annual prepay) read from this module so a price change
// is one constant away.
//
// Model:
//   - $4.99 per door per month (the unit price)
//   - $200/month minimum (an HOA with very few doors still pays $200)
//   - 10% discount when paying for a full year up front
//   - First year is committed — Stripe subscription created with a
//     12-month minimum term. Cancellation requests are honored from
//     month 13 onward.

export const PRICING = {
  /** USD per door per month. */
  PER_DOOR_USD: 4.99,
  /** Floor on the monthly bill — covers very small HOAs. */
  MIN_MONTHLY_USD: 200,
  /** Discount % on the annual prepay (applied to the full 12 × monthly). */
  ANNUAL_DISCOUNT_PCT: 10,
  /** Number of months the customer is committed for. */
  COMMIT_MONTHS: 12,
} as const

/** Effective doors used for billing — never below the implied minimum. */
export function billableDoors(doors: number): number {
  const minDoors = Math.ceil(PRICING.MIN_MONTHLY_USD / PRICING.PER_DOOR_USD)
  return Math.max(doors, minDoors)
}

/** Plain monthly cost in USD for a given door count, after the minimum kicks in. */
export function monthlyCostUsd(doors: number): number {
  return round2(billableDoors(doors) * PRICING.PER_DOOR_USD)
}

/** Annual cost in USD with the 10% discount applied. */
export function annualCostUsd(doors: number): number {
  const monthly = monthlyCostUsd(doors)
  const undiscounted = monthly * 12
  const discounted = undiscounted * (1 - PRICING.ANNUAL_DISCOUNT_PCT / 100)
  return round2(discounted)
}

/** Annual savings = (monthly × 12) − annual price. */
export function annualSavingsUsd(doors: number): number {
  return round2(monthlyCostUsd(doors) * 12 - annualCostUsd(doors))
}

export interface BillingSummary {
  doors: number
  /** Doors actually billed (max of input and minimum-implied). */
  billableDoors: number
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
