import { Kpi } from '@homeowner-portal/ui'
import {
  ANNUAL_UNIT_CENTS,
  MONTHLY_UNIT_CENTS,
  PRICING,
  billableDoors,
  billingSummary,
  formatUsd,
  minimumMonthlyUsd,
} from '@homeowner-portal/billing'

// Display strings for Settings → Billing. Every amount comes from
// billingSummary(), which is the Stripe Price's unit_amount × quantity in
// cents, so what the page shows is what checkout charges to the cent.

const cents = (v: number) => formatUsd(v, { withCents: true })

export function billingPriceCopy() {
  const minimum = `${billableDoors(0)}-door minimum (${cents(minimumMonthlyUsd())}/month)`
  return {
    perDoorMonthly: cents(MONTHLY_UNIT_CENTS / 100),
    perDoorAnnual: cents(ANNUAL_UNIT_CENTS / 100),
    minimum,
    description: `${cents(MONTHLY_UNIT_CENTS / 100)} per door per month, ${minimum}. Pay annually and save ${PRICING.ANNUAL_DISCOUNT_PCT}%.`,
  }
}

/** The three totals on the Current plan card. */
export function PlanTotals({ doors }: { doors: number }) {
  const s = billingSummary(doors)
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Kpi label="Doors on file" value={String(doors)} hint={s.minApplied ? `Billed as ${s.billableDoors} (minimum)` : undefined} />
      <Kpi label="Monthly" value={cents(s.monthlyUsd)} hint="per month" />
      <Kpi
        label={`Annual · save ${PRICING.ANNUAL_DISCOUNT_PCT}%`}
        value={cents(s.annualUsd)}
        hint={`per year · ${cents(s.annualSavingsUsd)} less than monthly`}
      />
    </div>
  )
}
