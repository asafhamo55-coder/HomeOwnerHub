export { getStripe, isStripeConfigured, STRIPE_API_VERSION } from './client'
export { createCheckoutSession, createPortalSession } from './checkout'
export type { CheckoutSessionInput } from './checkout'
export { handleStripeWebhook, applyStripeEvent, webhookHttpStatus } from './webhook'
export type { WebhookHandleResult, WebhookDb } from './webhook'
export {
  AUDIT_SUBSCRIPTION_UPDATED,
  AUDIT_INVOICE_PAYMENT_FAILED,
  BILLING_AUDIT_ACTIONS,
  billingAttention,
  billingAttentionMessage,
  planForPrice,
  statusEffect,
} from './billing-status'
export type { BillingAttention, BillingAuditRow } from './billing-status'
export { checkoutErrorMessage, stripeErrorFacts, SUPPORT_EMAIL } from './errors'
export type { StripeErrorFacts } from './errors'
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
export type { OrgPlanFromPrice } from './billing-status'
// BL-104 — Essentials / Complete band pricing, behind PRICING_V2.
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
export { planV2Checkout } from './checkout-v2'
export type { V2CheckoutFacts, V2CheckoutPlan } from './checkout-v2'
export { grandfathering, legacyRenewalDate, addMonthsUtc, RENEWAL_NOTICE_DAYS, RENEWAL_TARGET_PLAN } from './grandfathering'
export type { LegacySubscriptionFacts, GrandfatheringDecision } from './grandfathering'
