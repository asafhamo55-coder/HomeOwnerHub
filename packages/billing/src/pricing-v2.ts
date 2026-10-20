// BL-104 — Essentials / Complete in flat size bands
// (docs/decisions/2026-10-20-pricing.md §1). Pure: no Stripe client, no
// database, no env. Checkout, Settings → Billing, the Stripe setup route,
// the AI ceilings and the marketing test all read the numbers from here.
//
// Stripe model: one recurring Price per plan × cadence with
// billing_scheme 'tiered' and tiers_mode 'volume', quantity = doors.
// Bands 1–50 / 51–100 / 101–200 / 201–400 are a flat_amount (unit 0);
// 401+ is a per-door unit_amount, plus a flat_amount on Complete so the
// price never falls when a 400-door HOA adds a door. With volume tiers
// Stripe prices ALL units at the one tier the quantity lands in, which is
// exactly planPriceCents() below (stripeVolumeTotalCents proves it).
//
// Annual = 10 × monthly (2 months free). No door minimum and no `ceil`
// floor: a 1-door HOA pays the 1–50 band.

export const HOA_PLAN_IDS = ['essentials', 'complete'] as const
export type HoaPlanId = (typeof HOA_PLAN_IDS)[number]

export const BILLING_CADENCES = ['monthly', 'annual'] as const
export type BillingCadence = (typeof BILLING_CADENCES)[number]

export const BAND_IDS = ['1-50', '51-100', '101-200', '201-400', '401+'] as const
export type BandId = (typeof BAND_IDS)[number]

export interface Band {
  id: BandId
  minDoors: number
  /** Inclusive upper edge; null for the open-ended 401+ band. */
  maxDoors: number | null
}

export const BANDS: readonly Band[] = [
  { id: '1-50', minDoors: 1, maxDoors: 50 },
  { id: '51-100', minDoors: 51, maxDoors: 100 },
  { id: '101-200', minDoors: 101, maxDoors: 200 },
  { id: '201-400', minDoors: 201, maxDoors: 400 },
  { id: '401+', minDoors: 401, maxDoors: null },
]

/** Monthly flat price per closed band, in cents (1–50, 51–100, 101–200, 201–400). */
export const BAND_MONTHLY_CENTS: Readonly<Record<HoaPlanId, readonly [number, number, number, number]>> = {
  essentials: [4900, 7900, 11900, 17900],
  complete: [9900, 14900, 22900, 34900],
}

/** 401+ monthly: flat + per door, in cents. Essentials $0.45/door; Complete $9 + $0.85/door. */
export const OPEN_BAND_MONTHLY_CENTS: Readonly<Record<HoaPlanId, { flatCents: number; perDoorCents: number }>> = {
  essentials: { flatCents: 0, perDoorCents: 45 },
  complete: { flatCents: 900, perDoorCents: 85 },
}

/** Annual = this many monthly bills (2 months free). */
export const ANNUAL_MONTHS_BILLED = 10

/** New subscriptions: 30-day free trial, on Essentials limits, no card to start. */
export const TRIAL_DAYS = 30

/** Stripe Price lookup keys for the four new Prices. */
export const V2_LOOKUP_KEYS: Readonly<Record<HoaPlanId, Record<BillingCadence, string>>> = {
  essentials: { monthly: 'hoa_essentials_monthly', annual: 'hoa_essentials_annual' },
  complete: { monthly: 'hoa_complete_monthly', annual: 'hoa_complete_annual' },
}

/** Explicit env overrides for the four Price ids (checked before the lookup key). */
export const V2_PRICE_ENV: Readonly<Record<HoaPlanId, Record<BillingCadence, string>>> = {
  essentials: { monthly: 'STRIPE_PRICE_ESSENTIALS_MONTHLY', annual: 'STRIPE_PRICE_ESSENTIALS_ANNUAL' },
  complete: { monthly: 'STRIPE_PRICE_COMPLETE_MONTHLY', annual: 'STRIPE_PRICE_COMPLETE_ANNUAL' },
}

export const PLAN_LABEL: Readonly<Record<HoaPlanId, string>> = {
  essentials: 'Essentials',
  complete: 'Complete',
}

export function isHoaPlanId(v: unknown): v is HoaPlanId {
  return v === 'essentials' || v === 'complete'
}

/**
 * Doors as a Stripe quantity: a whole number, at least 1. Non-finite or
 * below 1 is treated as 1 (the 1–50 band); a fraction rounds up. Checkout
 * itself refuses 0 units before it gets here ("add your homes first").
 */
export function normalizeDoors(doors: number): number {
  if (!Number.isFinite(doors) || doors < 1) return 1
  return Math.ceil(doors)
}

/** The size band a door count falls in. */
export function bandFor(doors: number): Band {
  const d = normalizeDoors(doors)
  for (const b of BANDS) if (b.maxDoors === null || d <= b.maxDoors) return b
  return BANDS[BANDS.length - 1]!
}

/** Monthly price in cents for one plan at a door count. */
export function monthlyPriceCents(plan: HoaPlanId, doors: number): number {
  const d = normalizeDoors(doors)
  const idx = BANDS.indexOf(bandFor(d))
  if (idx < 4) return BAND_MONTHLY_CENTS[plan][idx]!
  const open = OPEN_BAND_MONTHLY_CENTS[plan]
  return open.flatCents + open.perDoorCents * d
}

/** The price Stripe charges per billing period, in integer cents. */
export function planPriceCents(plan: HoaPlanId, cadence: BillingCadence, doors: number): number {
  const monthly = monthlyPriceCents(plan, doors)
  return cadence === 'annual' ? monthly * ANNUAL_MONTHS_BILLED : monthly
}

/** Same in USD, for display. */
export function planPriceUsd(plan: HoaPlanId, cadence: BillingCadence, doors: number): number {
  return planPriceCents(plan, cadence, doors) / 100
}

/** Annual savings vs 12 monthly bills (= two months), in USD. */
export function planAnnualSavingsUsd(plan: HoaPlanId, doors: number): number {
  return (monthlyPriceCents(plan, doors) * 12 - planPriceCents(plan, 'annual', doors)) / 100
}

/** "1–50 doors", "401+ doors". */
export function bandLabel(band: Band): string {
  return band.maxDoors === null ? `${band.minDoors}+ doors` : `${band.minDoors}–${band.maxDoors} doors`
}

// ─── Stripe tier parameters ──────────────────────────────────────────

export interface StripeTier {
  up_to: number | 'inf'
  flat_amount: number
  unit_amount: number
}

/**
 * The `tiers` array for the Stripe Price of plan × cadence
 * (billing_scheme 'tiered', tiers_mode 'volume'). Used by the setup route
 * and listed in docs/specs/2026-10-20-pricing-v2-rollout.md.
 */
export function stripeTiers(plan: HoaPlanId, cadence: BillingCadence): StripeTier[] {
  const mult = cadence === 'annual' ? ANNUAL_MONTHS_BILLED : 1
  const closed = BAND_MONTHLY_CENTS[plan].map((cents, i) => ({
    up_to: BANDS[i]!.maxDoors as number,
    flat_amount: cents * mult,
    unit_amount: 0,
  }))
  const open = OPEN_BAND_MONTHLY_CENTS[plan]
  return [...closed, { up_to: 'inf', flat_amount: open.flatCents * mult, unit_amount: open.perDoorCents * mult }]
}

/**
 * What Stripe charges for `quantity` on a volume-tiered Price: the tier
 * the quantity lands in, its flat_amount plus unit_amount × quantity.
 * Exists so a test can prove the tiers and planPriceCents agree.
 */
export function stripeVolumeTotalCents(tiers: readonly StripeTier[], quantity: number): number {
  const tier = tiers.find((t) => t.up_to === 'inf' || quantity <= t.up_to)
  if (!tier) throw new Error('no tier')
  return tier.flat_amount + tier.unit_amount * quantity
}

// ─── Plans on orgs.plan ──────────────────────────────────────────────

/**
 * orgs.plan values written for the $4.99/door Prices (the webhook writes
 * the cadence; 'legacy_per_door' is reserved for the cut-over). These are
 * grandfathered: they keep their price until renewal and get Complete
 * entitlements and limits.
 */
export const LEGACY_PLAN_VALUES = ['monthly', 'annual', 'legacy_per_door'] as const

export function isLegacyPlan(plan: string | null | undefined): boolean {
  return !!plan && (LEGACY_PLAN_VALUES as readonly string[]).includes(plan)
}

/** No paid subscription: 'free' (the default and the trial-ended state), empty or null. */
export function isUnsubscribedPlan(plan: string | null | undefined): boolean {
  return !plan || plan === 'free'
}

/**
 * The plan whose entitlements and AI limits an org gets.
 *
 * Before PRICING_V2 every org is Complete: nobody loses a feature or
 * capacity they have today. After the flip: 'essentials' and an org with no
 * subscription (trial / trial ended) get Essentials; 'complete', legacy
 * $4.99/door subscriptions and any other value (pilot overrides such as
 * 'pro') get Complete — fail open, never strip a paying customer.
 */
export function effectivePlan(plan: string | null | undefined, pricingV2: boolean): HoaPlanId {
  if (!pricingV2) return 'complete'
  if (plan === 'essentials' || isUnsubscribedPlan(plan)) return 'essentials'
  return 'complete'
}

/**
 * Whether an org is on the trial footing (decision §3: "1–50 (and trial)"):
 * only once PRICING_V2 is on, and only for orgs with no subscription.
 */
export function onTrialFooting(plan: string | null | undefined, pricingV2: boolean): boolean {
  return pricingV2 && isUnsubscribedPlan(plan)
}
