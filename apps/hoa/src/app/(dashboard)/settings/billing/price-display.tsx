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
  effectivePlan,
  planAnnualSavingsUsd,
  planPriceUsd,
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

// ─── BL-104 (PRICING_V2) ─────────────────────────────────────────────

/** Page description once the band pricing is live. Amounts from planPriceCents. */
export function billingPriceCopyV2() {
  const ess = formatUsd(planPriceUsd('essentials', 'monthly', 1))
  const comp = formatUsd(planPriceUsd('complete', 'monthly', 1))
  return {
    description: `Essentials from ${ess}/month, Complete from ${comp}/month, priced by the size of your community. Pay annually and get 2 months free. Cancel any time.`,
  }
}

/**
 * The Current plan card's totals on the band pricing. `plan` is orgs.plan;
 * a legacy or unsubscribed org is shown the plan it gets (effectivePlan).
 */
export function PlanTotalsV2({ homes, plan }: { homes: number; plan: string }) {
  const p = effectivePlan(plan, true)
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Kpi label="Homes on file" value={String(homes)} hint={`${bandLabel(bandFor(homes))} band`} />
      <Kpi label={`${PLAN_LABEL[p]} · monthly`} value={cents(planPriceUsd(p, 'monthly', homes))} hint="per month" />
      <Kpi
        label={`${PLAN_LABEL[p]} · annual`}
        value={cents(planPriceUsd(p, 'annual', homes))}
        hint={`per year · 2 months free (${cents(planAnnualSavingsUsd(p, homes))} less)`}
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
