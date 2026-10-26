/**
 * BL-158: the Georgia foreclosure-threshold panel and the SB 406
 * payment-order note on a collections case. Pure and read-only: it
 * reuses BL-154's arithmetic (gaForeclosureCount, gaForeclosureThresholdCents)
 * and BL-137's dues-rate schedule, and changes no payment, letter or case.
 *
 * Date-aware, by the association's today:
 *   - before January 1, 2027 the rule in force is § 44-3-232(c)'s $2,000
 *     floor on the lien; the panel shows that, says it changes on
 *     January 1, 2027, and previews the 2027 count;
 *   - from January 1, 2027 (SB 406 § 5) the threshold is the lesser of
 *     $4,000 or 12 months of regular assessments, never under $2,000,
 *     counting only regular and special assessments in arrears.
 *
 * Every quote shown comes from ga-sb406-2026-2027-text.txt (the official
 * SB 406 text), checked word for word by ga-threshold.test.ts.
 */

import {
  GA_17A1_SPECIFIC,
  GA_17A8_NO_REFUSAL,
  GA_17A8_ORDER,
  GA_232C_2027_MINIMUM,
  type DriftCitation,
} from '@/lib/compliance/statute-drift'
import { annualCents, rateInEffect, rateLabel, type DuesRate } from '@/lib/dues-rates/model'
import { GA_232C_REPLACED_ON, GA_FORECLOSURE_CAP_CENTS_2027, GA_FORECLOSURE_MIN_CENTS, gaForeclosureThresholdCents } from './letters/law'
import { gaForeclosureCount, letterFigures, letterJurisdiction, type LetterInput } from './letters/model'

/** Quoted under the threshold, verbatim from the SB 406 fixture. */
export const GA_THRESHOLD_PANEL_QUOTES: readonly DriftCitation[] = [GA_232C_2027_MINIMUM, GA_17A1_SPECIFIC]
/** Quoted under the payment-order note, verbatim from the SB 406 fixture. */
export const GA_PAYMENT_ORDER_QUOTES: readonly DriftCitation[] = [GA_17A8_ORDER, GA_17A8_NO_REFUSAL]

/** The § 43-17A-8(a) order in plain words, for the note. */
export const GA_PAYMENT_ORDER_STEPS: readonly string[] = [
  'Regular assessments (dues), until current',
  'Special assessments, until current',
  'Specific assessments (late charges, fines for late payment or a violation, damage charges), until current',
  'Other fees and fines',
]

export const GA_PAYMENT_ORDER_NOT_APPLIED =
  'This is a note only. HomeownerHub doesn’t apply payments in this order and doesn’t check how past payments were applied; the board picks the charge a payment pays when it records it.'

/** Where the 12-month figure came from. */
export type TwelveMonths =
  | { kind: 'schedule'; cents: number; rateLabel: string; effectiveFrom: string }
  /** not_live: the dues-rate schedule isn't on yet; no_rate: none in effect; failed: the read failed. */
  | { kind: 'missing'; reason: 'not_live' | 'no_rate' | 'failed' }

/** at_or_above: foreclosure is not barred by the threshold; depends: needs the 12-month figure. */
export type ThresholdStatus = 'at_or_above' | 'below' | 'depends'

export interface GaThreshold2027 {
  /** Regular and special assessments in arrears, less unapplied credit (BL-154's count). */
  countedCents: number
  /** Unapplied payments and credits taken off the count: 0 or negative. */
  creditCents: number
  /** Payment-plan installments past due, left out of the count (BL-154). */
  planCents: number
  /** Past-due late charges, fines and fees, left out of the count. */
  excludedCents: number
  twelve: TwelveMonths
  /** The threshold, or null when it depends on a 12-month figure the app doesn't have. */
  thresholdCents: number | null
  floorCents: number
  capCents: number
  status: ThresholdStatus
}

export interface GaThresholdView {
  asOf: string
  /** True from January 1, 2027: the 2027 rule is the rule in force. */
  sb406InForce: boolean
  changesOn: string
  /** Before 2027 only: the $2,000 floor on the lien, the rule in force today. */
  current: { lienCents: number; floorCents: number; status: Exclude<ThresholdStatus, 'depends'> } | null
  rule2027: GaThreshold2027
}

const NOT_COUNTED = new Set(['regular', 'special', 'plan_installment'])

/** 12 months of regular assessments from the schedule's rate in effect on `day`. */
export function twelveMonthsFrom(rates: readonly DuesRate[] | null, live: boolean, day: string): TwelveMonths {
  if (!live) return { kind: 'missing', reason: 'not_live' }
  if (rates === null) return { kind: 'missing', reason: 'failed' }
  const rate = rateInEffect(rates.filter((r) => r.basis === 'per_home'), day)
  if (!rate) return { kind: 'missing', reason: 'no_rate' }
  return { kind: 'schedule', cents: annualCents(rate), rateLabel: rateLabel(rate), effectiveFrom: rate.effectiveFrom }
}

/** The 2027 verdict: with no 12-month figure, the threshold is somewhere from $2,000 to $4,000. */
export function threshold2027Status(countedCents: number, twelve: TwelveMonths): { thresholdCents: number | null; status: ThresholdStatus } {
  if (twelve.kind === 'schedule') {
    const t = gaForeclosureThresholdCents(twelve.cents)
    return { thresholdCents: t, status: countedCents >= t ? 'at_or_above' : 'below' }
  }
  if (countedCents >= GA_FORECLOSURE_CAP_CENTS_2027) return { thresholdCents: null, status: 'at_or_above' }
  if (countedCents < GA_FORECLOSURE_MIN_CENTS) return { thresholdCents: null, status: 'below' }
  return { thresholdCents: null, status: 'depends' }
}

/**
 * The panel for one home on `asOf` (the association's today), or null when
 * the home's association isn't in Georgia.
 */
export function gaThresholdView(input: LetterInput, asOf: string, dues: { rates: readonly DuesRate[] | null; live: boolean }): GaThresholdView | null {
  if (letterJurisdiction(input.state) !== 'GA') return null
  const figures = letterFigures(input, 'ga_pre_foreclosure', asOf)
  const { countedCents, planCents } = gaForeclosureCount(figures)
  const excludedCents = [...figures.lateFeeLines, ...figures.otherLines, ...figures.omittedLines]
    .filter((l) => !NOT_COUNTED.has(l.type))
    .reduce((t, l) => t + l.remainingCents, 0)
  const twelve = twelveMonthsFrom(dues.rates, dues.live, asOf)
  const sb406InForce = asOf >= GA_232C_REPLACED_ON
  const lienCents = Math.max(0, figures.ledgerCents)
  return {
    asOf,
    sb406InForce,
    changesOn: GA_232C_REPLACED_ON,
    current: sb406InForce
      ? null
      : { lienCents, floorCents: GA_FORECLOSURE_MIN_CENTS, status: lienCents >= GA_FORECLOSURE_MIN_CENTS ? 'at_or_above' : 'below' },
    rule2027: {
      countedCents,
      creditCents: figures.creditCents,
      planCents,
      excludedCents,
      twelve,
      ...threshold2027Status(countedCents, twelve),
      floorCents: GA_FORECLOSURE_MIN_CENTS,
      capCents: GA_FORECLOSURE_CAP_CENTS_2027,
    },
  }
}
