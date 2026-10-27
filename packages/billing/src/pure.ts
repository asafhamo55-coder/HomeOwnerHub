/**
 * Client-safe slice of the billing package: pricing maths, plan/band
 * constants and module entitlements. No Stripe SDK, no webhook code, no db.
 *
 * `@homeowner-portal/billing` (index.ts) re-exports the Stripe client, so a
 * 'use client' file importing the barrel ships the ~80 kB `stripe` SDK to the
 * browser. Client components import `@homeowner-portal/billing/pure` instead.
 */
export {
  PRICING,
  MONTHLY_UNIT_CENTS,
  ANNUAL_UNIT_CENTS,
  billableDoors,
  monthlyCostCents,
  annualCostCents,
  minimumMonthlyUsd,
  monthlyCostUsd,
  annualCostUsd,
  annualSavingsUsd,
  billingSummary,
  formatUsd,
} from './pricing'
export type { BillingSummary } from './pricing'
export { PRICING_V2 } from './pricing-flag'
export {
  HOA_PLAN_IDS,
  BILLING_CADENCES,
  BAND_IDS,
  BANDS,
  BAND_MONTHLY_CENTS,
  OPEN_BAND_MONTHLY_CENTS,
  ANNUAL_MONTHS_BILLED,
  TRIAL_DAYS,
  V2_LOOKUP_KEYS,
  V2_PRICE_ENV,
  PLAN_LABEL,
  LEGACY_PLAN_VALUES,
  isHoaPlanId,
  normalizeDoors,
  bandFor,
  bandLabel,
  monthlyPriceCents,
  planPriceCents,
  planPriceUsd,
  planAnnualSavingsUsd,
  stripeTiers,
  stripeVolumeTotalCents,
  isLegacyPlan,
  isUnsubscribedPlan,
  effectivePlan,
  onTrialFooting,
} from './pricing-v2'
export type { HoaPlanId, BillingCadence, BandId, Band, StripeTier } from './pricing-v2'
export { HOA_MODULES, MODULE_LABEL, PLAN_MODULES, moduleEnabled, enabledModules, modulesAddedByComplete } from './entitlements'
export type { HoaModule, ModuleOverrides } from './entitlements'
