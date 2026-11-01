import { Kpi } from '@homeowner-portal/ui'
import {
  ANNUAL_UNIT_CENTS,
  MONTHLY_UNIT_CENTS,
  PRICING,
  billableDoors,
  billingSummary,
  formatUsd,
  minimumMonthlyUsd,
  PLAN_LABEL,
  bandFor,
  bandLabel,
  SOLD_PLAN_ID,
  SOLD_PRICE_FAMILY,
  type PriceFamilyId,
  planAnnualSavingsUsd,
  planPriceUsd,
} from '@homeowner-portal/billing/pure'

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

// ─── BL-104 (PRICING_V2) ─────────────────────────────────────────────

/** Page description once the band pricing is live. Amounts from planPriceCents. */
export function billingPriceCopyV2() {
  const from = formatUsd(planPriceUsd(SOLD_PRICE_FAMILY, 'monthly', 1))
  return {
    description: `One plan, everything included, from ${from}/month, priced by the size of your community. Pay annually and get 2 months free. Cancel any time.`,
  }
}

/**
 * The Current plan card's totals on the band pricing. `family` is the Price
 * family the org's Stripe subscription is actually on (the old Essentials and
 * Complete Prices keep their price; orgs.plan alone cannot tell the
 * Essentials Prices from the new ones). An org with no subscription is shown
 * the Price it would be sold. null = the subscription's Price could not be
 * read: show the homes only, never a guessed amount.
 */
export function PlanTotalsV2({ homes, family }: { homes: number; family: PriceFamilyId | null }) {
  if (!family) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Kpi label="Homes on file" value={String(homes)} hint={`${bandLabel(bandFor(homes))} band`} />
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Kpi label="Homes on file" value={String(homes)} hint={`${bandLabel(bandFor(homes))} band`} />
      <Kpi label={`${PLAN_LABEL[SOLD_PLAN_ID]} · monthly`} value={cents(planPriceUsd(family, 'monthly', homes))} hint="per month" />
      <Kpi
        label={`${PLAN_LABEL[SOLD_PLAN_ID]} · annual`}
        value={cents(planPriceUsd(family, 'annual', homes))}
        hint={`per year · 2 months free (${cents(planAnnualSavingsUsd(family, homes))} less)`}
      />
    </div>
  )
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
