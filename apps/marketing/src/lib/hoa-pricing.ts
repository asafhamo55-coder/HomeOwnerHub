// HomeownerHub HOA pricing as the marketing site shows it. ONE source for /pricing,
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
// BL-104: the Essentials / Complete band pricing
// (docs/decisions/2026-10-20-pricing.md) is here too, behind PRICING_V2.
// The flag MIRRORS packages/billing/src/pricing-flag.ts (the test fails if
// they differ), so the site switches in the same commit as checkout — the
// marketing-truth rule (2026-10-18-marketing-pricing-truth.md §5). While
// it is false, nothing below the legacy section reaches a page.

/** Mirrors packages/billing/src/pricing-flag.ts. Flip both in one commit. */
export const PRICING_V2: boolean = false

// ─── Legacy: $4.99/door (what checkout charges while PRICING_V2 is off) ──

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

/** Monthly bill in USD on the legacy monthly plan. */
export function legacyMonthlyBillUsd(doors: number): number {
  return round2(billableDoors(doors) * HOA_PRICING.PER_DOOR_USD)
}

/** Yearly bill in USD on the legacy annual plan: billable doors x the annual Price. */
export function legacyAnnualBillUsd(doors: number): number {
  return Math.round(billableDoors(doors) * ANNUAL_PER_DOOR_YEARLY_USD * 100) / 100
}

export const MIN_BILLABLE_DOORS = billableDoors(1)
export const MIN_MONTHLY_BILL_USD = legacyMonthlyBillUsd(1)

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

// ─── BL-104: Essentials / Complete in flat size bands ────────────────────
// Literal copy of packages/billing/src/pricing-v2.ts, pinned by the test.

export type HoaBandPlan = 'essentials' | 'complete'

/** Upper edges of the closed bands; 401+ is per door. */
export const BAND_EDGES = [50, 100, 200, 400] as const
/** Monthly cents per closed band. */
export const BAND_MONTHLY_CENTS: Readonly<Record<HoaBandPlan, readonly [number, number, number, number]>> = {
  essentials: [4900, 7900, 11900, 17900],
  complete: [9900, 14900, 22900, 34900],
}
/** 401+: flat + per door, monthly cents. */
export const OPEN_BAND_MONTHLY_CENTS: Readonly<Record<HoaBandPlan, { flatCents: number; perDoorCents: number }>> = {
  essentials: { flatCents: 0, perDoorCents: 45 },
  complete: { flatCents: 900, perDoorCents: 85 },
}
export const ANNUAL_MONTHS_BILLED = 10
export const TRIAL_DAYS = 30

/** Monthly price in USD for a plan at a door count (1 door minimum, no floor). */
export function bandMonthlyUsd(plan: HoaBandPlan, doors: number): number {
  const d = !Number.isFinite(doors) || doors < 1 ? 1 : Math.ceil(doors)
  const idx = BAND_EDGES.findIndex((edge) => d <= edge)
  if (idx >= 0) return BAND_MONTHLY_CENTS[plan][idx]! / 100
  const open = OPEN_BAND_MONTHLY_CENTS[plan]
  return (open.flatCents + open.perDoorCents * d) / 100
}

/** Annual price in USD: 10 x monthly. */
export function bandAnnualUsd(plan: HoaBandPlan, doors: number): number {
  return Math.round(bandMonthlyUsd(plan, doors) * 100 * ANNUAL_MONTHS_BILLED) / 100
}

// ─── The view pages render ────────────────────────────────────────────

export interface HoaPlan {
  /** Legacy cadence plans, or a BL-104 plan. */
  id: 'monthly' | 'annual' | HoaBandPlan
  name: string
  price: string
  period: string
  sub: string
  cta: string
  featured?: boolean
}

export interface HoaPricingView {
  plans: readonly HoaPlan[]
  copy: {
    perDoor: string
    minimum: string
    term: string
    /** One sentence for teasers, metadata and FAQs. */
    summary: string
    /** Short form for page titles. */
    title: string
    /** /pricing hero and the homepage teaser heading. */
    headline: string
    /** The /pricing "Is there a contract?" answer. */
    contract: string
    /** /compare "Contract term" cell. */
    contractShort: string
    /** The /demo FAQ lead-in before `summary`. */
    model: string
  }
  /** "All features" monthly bill at a size (Complete on the band pricing). */
  monthlyBillUsd: (doors: number) => number
  /** "All features" annual bill at a size. */
  annualBillUsd: (doors: number) => number
  /** Doors below which the ROI calculator labels the price "(minimum)"; 0 = none. */
  minBillableDoors: number
}

function legacyView(): HoaPricingView {
  const perDoor = formatUsd(HOA_PRICING.PER_DOOR_USD, { withCents: true })
  const minimum = `${MIN_BILLABLE_DOORS}-door minimum (${formatUsd(MIN_MONTHLY_BILL_USD, { withCents: true })}/mo)`
  const term = `first ${HOA_PRICING.COMMIT_MONTHS} months committed`
  return {
    plans: [
      {
        id: 'monthly',
        name: 'HOA Monthly',
        price: perDoor,
        period: '/door · mo',
        sub: `${minimum} · billed monthly · ${term}`,
        cta: 'Start monthly',
      },
      {
        id: 'annual',
        name: 'HOA Annual',
        price: formatUsd(ANNUAL_PER_DOOR_MONTHLY_USD, { withCents: true }),
        period: '/door · mo',
        sub: `Save ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% · billed yearly (${formatUsd(ANNUAL_PER_DOOR_YEARLY_USD, { withCents: true })}/door) · ${term}`,
        cta: `Save ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% annually`,
        featured: true,
      },
    ],
    copy: {
      perDoor,
      minimum,
      term,
      summary: `${perDoor} per door per month, ${minimum}. ${HOA_PRICING.ANNUAL_DISCOUNT_PCT}% off when you pay for the year.`,
      title: `${perDoor} per door per month`,
      headline: 'One price per door. No tiers, no add-ons.',
      contract: `Both plans start with a ${HOA_PRICING.COMMIT_MONTHS}-month first year that can't be cancelled. From month ${HOA_PRICING.COMMIT_MONTHS + 1} you can cancel any time from Settings → Billing. The six-month pilot comes before that and never converts on its own.`,
      contractShort: `First ${HOA_PRICING.COMMIT_MONTHS} months, after the pilot`,
      model: 'Pricing is per door with no per-feature add-ons:',
    },
    monthlyBillUsd: legacyMonthlyBillUsd,
    annualBillUsd: legacyAnnualBillUsd,
    minBillableDoors: MIN_BILLABLE_DOORS,
  }
}

function v2View(): HoaPricingView {
  const ess = formatUsd(bandMonthlyUsd('essentials', 1))
  const comp = formatUsd(bandMonthlyUsd('complete', 1))
  const bands = `${BAND_EDGES[0]}, ${BAND_EDGES[1]}, ${BAND_EDGES[2]} and ${BAND_EDGES[3]} homes`
  return {
    plans: [
      {
        id: 'essentials',
        name: 'Essentials',
        price: ess,
        period: '/mo',
        sub: `Up to ${BAND_EDGES[0]} homes · rises by size band · AI assistant included`,
        cta: 'Start free trial',
      },
      {
        id: 'complete',
        name: 'Complete',
        price: comp,
        period: '/mo',
        sub: `Up to ${BAND_EDGES[0]} homes · rises by size band · accounting, mailbox, vendors, leases`,
        cta: 'Start free trial',
        featured: true,
      },
    ],
    copy: {
      perDoor: `from ${ess}/mo`,
      minimum: 'no door minimum',
      term: 'month to month',
      summary: `Essentials from ${ess} a month and Complete from ${comp} a month, priced in size bands (up to ${bands}). 2 months free when you pay for the year. ${TRIAL_DAYS}-day free trial, cancel any time.`,
      title: `Essentials from ${ess}/mo, Complete from ${comp}/mo`,
      headline: 'Two plans. Priced by the size of your community.',
      contract: `No. Both plans are month to month and you can cancel any time from Settings → Billing. Paying for the year gets you 2 months free. Every plan starts with a ${TRIAL_DAYS}-day free trial, no card needed.`,
      contractShort: 'Month to month',
      model: 'Pricing is two plans in size bands, with no per-feature add-ons:',
    },
    monthlyBillUsd: (doors) => bandMonthlyUsd('complete', doors),
    annualBillUsd: (doors) => bandAnnualUsd('complete', doors),
    minBillableDoors: 0,
  }
}

export function hoaPricingView(pricingV2: boolean): HoaPricingView {
  return pricingV2 ? v2View() : legacyView()
}

const VIEW = hoaPricingView(PRICING_V2)

/** The plans checkout sells right now. */
export const HOA_PLANS: readonly HoaPlan[] = VIEW.plans
export const HOA_PRICE_COPY = VIEW.copy
/** "All features" monthly bill at a size — what checkout charges now. */
export const monthlyBillUsd = VIEW.monthlyBillUsd
/** "All features" annual bill at a size — what checkout charges now. */
export const annualBillUsd = VIEW.annualBillUsd
/** The ROI calculator's "(minimum)" threshold; 0 when there is no minimum. */
export const ROI_MIN_DOORS = VIEW.minBillableDoors

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
