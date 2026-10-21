/**
 * BL-137: the dues-rate schedule (dues_rates, migration 0069; M5_APPLIED).
 * Pure and client-safe: the schedule's arithmetic, the rate in effect on a
 * day, the change from one rate to the next, the pre-fill for billing and
 * the audited-override check. Money is in whole cents throughout.
 */

import { addCalendarDays } from '@/lib/association-time'

export const DUES_RATES_TABLE = 'dues_rates'
export const DUES_RATE_COLUMNS = 'id, association_id, effective_from, basis, amount_cents, frequency, budget_id, notes, created_at'

export const DUES_RATES_NOT_LIVE = 'Dues rates turn on after an update to the database. Until then, enter the amount each time you bill dues.'

/** How often a rate is billed. Mirrors the 0069 CHECK. */
export const RATE_FREQUENCIES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const
export type RateFrequency = (typeof RATE_FREQUENCIES)[number]

export const PERIODS_PER_YEAR: Record<RateFrequency, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }

export const FREQUENCY_LABELS: Record<RateFrequency, { adverb: string; per: string }> = {
  monthly: { adverb: 'Monthly', per: 'a month' },
  quarterly: { adverb: 'Quarterly', per: 'a quarter' },
  semiannual: { adverb: 'Twice a year', per: 'every six months' },
  annual: { adverb: 'Annually', per: 'a year' },
}

/**
 * Mirrors the 0069 CHECK. Only per_home is written today; the others are
 * room for a per-unit-type or per-share rate later (BL-137 "leave room").
 */
export const RATE_BASES = ['per_home', 'per_unit_type', 'per_share'] as const
export type RateBasis = (typeof RATE_BASES)[number]

/** The billing form's cap (lib/assessments.ts), in cents. */
export const MAX_RATE_CENTS = 10_000_000

export function isRateFrequency(v: unknown): v is RateFrequency {
  return typeof v === 'string' && (RATE_FREQUENCIES as readonly string[]).includes(v)
}

export interface DuesRate {
  id: string
  associationId: string
  effectiveFrom: string
  basis: RateBasis
  /** Per charge, at `frequency`. */
  amountCents: number
  frequency: RateFrequency
  budgetId: string | null
  notes: string | null
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export function isYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function rateFromRow(r: Record<string, unknown>): DuesRate | null {
  const amount = Number(r.amount_cents)
  if (typeof r.id !== 'string' || !isYmd(r.effective_from) || !isRateFrequency(r.frequency) || !Number.isFinite(amount) || amount <= 0) {
    return null
  }
  const basis = (RATE_BASES as readonly string[]).includes(String(r.basis)) ? (r.basis as RateBasis) : 'per_home'
  return {
    id: r.id,
    associationId: typeof r.association_id === 'string' ? r.association_id : '',
    effectiveFrom: r.effective_from,
    basis,
    amountCents: Math.round(amount),
    frequency: r.frequency,
    budgetId: typeof r.budget_id === 'string' ? r.budget_id : null,
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes : null,
  }
}

/** "$1,234.56" from cents. */
export function centsLabel(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "$250.00 a month". */
export function rateLabel(r: Pick<DuesRate, 'amountCents' | 'frequency'>): string {
  return `${centsLabel(r.amountCents)} ${FREQUENCY_LABELS[r.frequency].per}`
}

/** Dollars typed by a person ("1,250", "$99.5") to cents; null when empty; NaN when not money. */
export function dollarsToCents(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : Number.NaN
  const s = String(v).replace(/[$,\s]/g, '')
  if (s === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN
  return Math.round(Number(s) * 100)
}

export function annualCents(r: Pick<DuesRate, 'amountCents' | 'frequency'>): number {
  return r.amountCents * PERIODS_PER_YEAR[r.frequency]
}

/** Newest first (the schedule's display order). */
export function sortRates<T extends Pick<DuesRate, 'effectiveFrom'>>(rates: readonly T[]): T[] {
  return [...rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
}

/** The rate in effect on `day`: the latest that started on or before it. */
export function rateInEffect<T extends Pick<DuesRate, 'effectiveFrom'>>(rates: readonly T[], day: string): T | null {
  let best: T | null = null
  for (const r of rates) if (r.effectiveFrom <= day && (!best || r.effectiveFrom > best.effectiveFrom)) best = r
  return best
}

/** The next rate that starts after `today`, or null. */
export function upcomingRate<T extends Pick<DuesRate, 'effectiveFrom'>>(rates: readonly T[], today: string): T | null {
  let best: T | null = null
  for (const r of rates) if (r.effectiveFrom > today && (!best || r.effectiveFrom < best.effectiveFrom)) best = r
  return best
}

export interface RateChange {
  /** The rate in effect the day before `to` starts; null when `to` is the first. */
  from: DuesRate | null
  to: DuesRate
  fromAnnualCents: number | null
  toAnnualCents: number
  /** Change in the yearly amount, % to one decimal; null with no earlier rate. */
  pct: number | null
  /** Yearly amount, new − old, cents; null with no earlier rate. */
  deltaAnnualCents: number | null
}

/** Percentage change from one yearly amount to another, to one decimal. */
export function changePct(fromAnnual: number | null, toAnnual: number): number | null {
  if (fromAnnual === null || fromAnnual <= 0) return null
  return Math.round(((toAnnual - fromAnnual) / fromAnnual) * 1000) / 10
}

/** `to` against the rate in effect the day before it starts (yearly amounts, so frequencies compare). */
export function rateChange(rates: readonly DuesRate[], to: DuesRate): RateChange {
  const before = rates.filter((r) => r.id !== to.id)
  const from = rateInEffect(before, addCalendarDays(to.effectiveFrom, -1))
  const fromAnnualCents = from ? annualCents(from) : null
  const toAnnualCents = annualCents(to)
  return {
    from,
    to,
    fromAnnualCents,
    toAnnualCents,
    pct: changePct(fromAnnualCents, toAnnualCents),
    deltaAnnualCents: fromAnnualCents === null ? null : toAnnualCents - fromAnnualCents,
  }
}

/** "up 8.5%", "down 2%", "no change". */
export function pctPhrase(pct: number | null): string | null {
  if (pct === null) return null
  if (pct === 0) return 'no change'
  return `${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

// ─── billing ─────────────────────────────────────────────────────────

/**
 * How a billing form bills: Generate dues and "Add a due → Monthly" bill a
 * monthly charge, "Annually" one yearly charge, "Once" one charge at the
 * rate's own amount.
 */
export type BillingCadence = 'monthly' | 'annual' | 'one_time'

export interface PerCharge {
  cents: number
  /** False when the yearly amount doesn't divide into whole cents (rounded). */
  exact: boolean
}

/** What one charge should be under `rate`, for this cadence. */
export function perChargeCents(rate: Pick<DuesRate, 'amountCents' | 'frequency'>, cadence: BillingCadence): PerCharge {
  if (cadence === 'one_time') return { cents: rate.amountCents, exact: true }
  const yearly = annualCents(rate)
  if (cadence === 'annual') return { cents: yearly, exact: true }
  if (rate.frequency === 'monthly') return { cents: rate.amountCents, exact: true }
  return { cents: Math.round(yearly / 12), exact: yearly % 12 === 0 }
}

export interface BillingPrefill {
  rateId: string
  effectiveFrom: string
  cents: number
  exact: boolean
  /** "From the dues rate in effect on that day: $3,000.00 a year." */
  hint: string
}

/** The amount a billing form starts with on `day`, or null with no rate in effect. */
export function billingPrefill(rates: readonly DuesRate[], day: string, cadence: BillingCadence): BillingPrefill | null {
  const rate = rateInEffect(rates, day)
  if (!rate) return null
  const per = perChargeCents(rate, cadence)
  const converted =
    cadence === 'one_time' || (cadence === 'monthly' && rate.frequency === 'monthly') || (cadence === 'annual' && rate.frequency === 'annual')
      ? ''
      : ` = ${centsLabel(per.cents)} ${cadence === 'monthly' ? 'a month' : 'a year'}${per.exact ? '' : ' (rounded to the cent)'}`
  return {
    rateId: rate.id,
    effectiveFrom: rate.effectiveFrom,
    cents: per.cents,
    exact: per.exact,
    hint: `From the dues rate in effect: ${rateLabel(rate)}${converted}. You can change it; the change is recorded in the activity log.`,
  }
}

export interface RateOverride {
  rateId: string
  expectedCents: number
  billedCents: number
}

/** The billed amount differs from the rate in effect: what the audit row records. Null when it matches or no rate applies. */
export function rateOverride(rates: readonly DuesRate[], day: string, cadence: BillingCadence, billedCents: number): RateOverride | null {
  const rate = rateInEffect(rates, day)
  if (!rate) return null
  const expected = perChargeCents(rate, cadence).cents
  if (expected === billedCents) return null
  return { rateId: rate.id, expectedCents: expected, billedCents }
}

// ─── budget → rate ───────────────────────────────────────────────────

export interface BudgetSuggestion {
  amountCents: number
  frequency: RateFrequency
  effectiveFrom: string | null
  /** Plain words: where the figure came from. */
  explanation: string
}

/**
 * The adopted budget's assessment income ÷ billable homes
 * (lib/budget-notice/model.ts perHomeOf), as a rate at `frequency`,
 * starting the budget year's first day.
 */
export function suggestFromBudget(
  perHome: { annualCents: number; homes: number; assessmentIncomeCents?: number },
  frequency: RateFrequency,
  periodStart: string | null,
): BudgetSuggestion | null {
  if (!(perHome.annualCents > 0) || !(perHome.homes > 0)) return null
  const periods = PERIODS_PER_YEAR[frequency]
  const amountCents = Math.round(perHome.annualCents / periods)
  if (amountCents < 1 || amountCents > MAX_RATE_CENTS) return null
  const source =
    perHome.assessmentIncomeCents !== undefined
      ? `the adopted budget’s assessment income of ${centsLabel(perHome.assessmentIncomeCents)} ÷ ${perHome.homes} homes = ${centsLabel(perHome.annualCents)} a year per home`
      : `${centsLabel(perHome.annualCents)} a year per home, as billed for the budget year`
  const rounding = perHome.annualCents % periods === 0 ? '' : ' (rounded to the cent)'
  return {
    amountCents,
    frequency,
    effectiveFrom: periodStart,
    explanation: `Pre-filled from ${source}${periods > 1 ? `, billed ${FREQUENCY_LABELS[frequency].adverb.toLowerCase()}${rounding}` : ''}.`,
  }
}

// ─── form validation ─────────────────────────────────────────────────

export interface RateInput {
  effectiveFrom: string
  amount: string | number
  frequency: string
  notes?: string | null
  budgetId?: string | null
}

export interface ValidRate {
  effectiveFrom: string
  amountCents: number
  frequency: RateFrequency
  notes: string | null
  budgetId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateRate(input: RateInput): { ok: true; value: ValidRate } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {}
  if (!isYmd(input.effectiveFrom)) fieldErrors.effectiveFrom = 'Pick the day the rate starts.'
  const cents = dollarsToCents(input.amount)
  if (cents === null || !Number.isFinite(cents) || cents < 1) fieldErrors.amount = 'Enter the amount per home, like 250.'
  else if (cents > MAX_RATE_CENTS) fieldErrors.amount = 'Keep it at $100,000 or less.'
  if (!isRateFrequency(input.frequency)) fieldErrors.frequency = 'Pick how often it is billed.'
  const notes = typeof input.notes === 'string' ? input.notes.trim() : ''
  if (notes.length > 500) fieldErrors.notes = 'Keep it under 500 characters.'
  const budgetId = input.budgetId ?? null
  if (budgetId !== null && (typeof budgetId !== 'string' || !UUID.test(budgetId))) fieldErrors.budgetId = 'That budget isn’t valid.'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      effectiveFrom: input.effectiveFrom,
      amountCents: cents as number,
      frequency: input.frequency as RateFrequency,
      notes: notes || null,
      budgetId,
    },
  }
}
