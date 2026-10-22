// BL-147: the board's late-fee policy — the model, validation against the
// state cap, and the per-charge fee. Pure and dependency-free except ./law
// (packages/jobs imports this file by relative path; see ./law.ts).
//
// SAFE DEFAULT. With no saved, valid policy NO late fee is charged
// (docs/decisions/2026-10-21-late-fee-policy-safe-default.md). Before
// BL-147 the nightly job charged 5% on every overdue charge, fines and
// collection costs included, with no grace period and no board choice.

import { capSummary, lateFeeLaw, statutoryCapCents, type LateFeeLaw } from './law'

export type LateFeeMode = 'percent' | 'flat'

export interface LateFeePolicy {
  enabled: boolean
  mode: LateFeeMode
  /** Percent mode: basis points (500 = 5%). Null in flat mode. */
  percentBps: number | null
  /** Flat mode: cents. Null in percent mode. */
  flatCents: number | null
  /** Whole days after the due date before a charge is late. */
  graceDays: number
  /** Fines never earn a late fee unless the board turns this off. */
  excludeFines: boolean
  /** One late fee per charge, never repeated or compounded. The only rule supported. */
  oncePerCharge: true
  /** The board attests the declaration (or bylaws) provides for a late charge. */
  declarationAttested: boolean
  /** Where: e.g. "Declaration, Article VI, Section 3". */
  declarationRef: string | null
}

/** What an association that never chose a policy gets: nothing charged. */
export const DEFAULT_LATE_FEE_POLICY: LateFeePolicy = {
  enabled: false,
  mode: 'percent',
  percentBps: null,
  flatCents: null,
  graceDays: 15,
  excludeFines: true,
  oncePerCharge: true,
  declarationAttested: false,
  declarationRef: null,
}

/** audit_log.action for a board save of the policy (lib/late-fees/actions.ts). */
export const LATE_FEE_POLICY_AUDIT_ACTION = 'late_fee_policy.saved'
/** audit_log.action for one association's nightly run that charged fees (packages/jobs hoa-late-fees.ts). */
export const LATE_FEE_NIGHTLY_AUDIT_ACTION = 'late_fee.nightly_charged'

export const MAX_GRACE_DAYS = 90
/** No association's flat late fee is over $500; past this it is a typo. */
export const MAX_FLAT_CENTS = 50_000
export const MAX_DECLARATION_REF = 120

/** Charge types a late fee can attach to. Never a late fee, collection cost or lien fee. */
export const DUES_TYPES = ['regular', 'special'] as const
export const FINE_TYPE = 'fine'

export function eligibleChargeTypes(policy: Pick<LateFeePolicy, 'excludeFines'>): string[] {
  return policy.excludeFines ? [...DUES_TYPES] : [...DUES_TYPES, FINE_TYPE]
}

// ─── parsing ────────────────────────────────────────────────────────

function parsePercentBps(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/%$/, '').trim()
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

function parseCents(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

function parseDays(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null
  if (typeof v !== 'string') return null
  const t = v.trim()
  return /^\d{1,3}$/.test(t) ? Number(t) : null
}

/** Control and bidi characters out, whitespace collapsed. */
function cleanRef(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim()
  return t === '' ? null : t
}

export interface LateFeePolicyInput {
  enabled: unknown
  mode: unknown
  percent: unknown
  flat: unknown
  graceDays: unknown
  excludeFines: unknown
  declarationAttested: unknown
  declarationRef: unknown
}

export type LateFeeValidateResult =
  | { ok: true; value: LateFeePolicy }
  | { ok: false; fieldErrors: Record<string, string> }

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * The policy's breaches of the state rule, by field. Run at save time AND
 * by the nightly job on the saved policy (the state or the rule may have
 * changed since it was saved). Empty when it complies, or when off.
 */
export function lawErrors(policy: LateFeePolicy, law: LateFeeLaw | null): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!policy.enabled) return errors
  if (!policy.declarationAttested) {
    errors.declarationAttested = law?.requiresInstrument
      ? `${law.stateName} allows a late charge only if your declaration provides for one (${law.citation}). Confirm it does before turning late fees on.`
      : 'Confirm your declaration or bylaws provide for a late charge before turning late fees on.'
  }
  if (!policy.declarationRef) errors.declarationRef = 'Say where your declaration or bylaws provide for it, e.g. Article VI, Section 3.'
  if (!law) return errors
  if (policy.mode === 'percent' && policy.percentBps !== null && policy.percentBps > law.percent * 100) {
    errors.percent = `${law.stateName} caps a late charge at ${capSummary(law)} (${law.citation}). Choose ${law.percent}% or less.`
  }
  if (policy.graceDays < law.minGraceDays) {
    errors.graceDays = `In ${law.stateName} an assessment is delinquent only ${law.minGraceDays} days after it is due (${law.citation}). Use at least ${law.minGraceDays} days.`
  }
  return errors
}

/**
 * Board input → policy. State caps are enforced here (lawErrors), so a
 * policy above the cap can't be saved. A flat fee above the statutory
 * floor can be saved: the job cuts each fee to the cap for that charge
 * (lateFeeForCharge), and the screen says so.
 */
export function validateLateFeePolicy(input: LateFeePolicyInput, state: string | null): LateFeeValidateResult {
  const fieldErrors: Record<string, string> = {}
  const enabled = input.enabled === true
  const mode: LateFeeMode = input.mode === 'flat' ? 'flat' : 'percent'
  if (input.mode !== 'flat' && input.mode !== 'percent') fieldErrors.mode = 'Choose a percent or a flat amount.'

  let percentBps: number | null = null
  let flatCents: number | null = null
  if (mode === 'percent') {
    const p = parsePercentBps(input.percent)
    if (p === null || p <= 0 || p > 10_000) {
      if (enabled || (typeof input.percent === 'string' && input.percent.trim() !== '')) {
        fieldErrors.percent = 'Enter a percent between 0.01 and 100, e.g. 5 or 7.5.'
      }
    } else percentBps = p
  } else {
    const c = parseCents(input.flat)
    if (c === null || c <= 0 || c > MAX_FLAT_CENTS) {
      if (enabled || (typeof input.flat === 'string' && input.flat.trim() !== '')) {
        fieldErrors.flat = `Enter an amount between $0.01 and ${dollars(MAX_FLAT_CENTS)}.`
      }
    } else flatCents = c
  }

  const grace = parseDays(input.graceDays)
  if (grace === null || grace < 0 || grace > MAX_GRACE_DAYS) fieldErrors.graceDays = `Enter whole days, 0 to ${MAX_GRACE_DAYS}.`

  const ref = cleanRef(input.declarationRef)
  if (ref !== null && ref.length > MAX_DECLARATION_REF) fieldErrors.declarationRef = `Keep it under ${MAX_DECLARATION_REF} characters.`

  if (typeof input.excludeFines !== 'boolean') fieldErrors.excludeFines = 'Choose whether fines are excluded.'

  const value: LateFeePolicy = {
    enabled,
    mode,
    percentBps,
    flatCents,
    graceDays: grace ?? 0,
    excludeFines: input.excludeFines !== false,
    oncePerCharge: true,
    declarationAttested: input.declarationAttested === true,
    declarationRef: ref,
  }
  Object.assign(fieldErrors, { ...lawErrors(value, lateFeeLaw(state)), ...fieldErrors })
  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, value }
}

/** Shape check for a stored policy (after its signature verified). */
export function isLateFeePolicy(v: unknown): v is LateFeePolicy {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  const intOrNull = (x: unknown) => x === null || (typeof x === 'number' && Number.isInteger(x) && x > 0)
  return (
    typeof p.enabled === 'boolean' &&
    (p.mode === 'percent' || p.mode === 'flat') &&
    intOrNull(p.percentBps) &&
    intOrNull(p.flatCents) &&
    typeof p.graceDays === 'number' &&
    Number.isInteger(p.graceDays) &&
    p.graceDays >= 0 &&
    p.graceDays <= MAX_GRACE_DAYS &&
    typeof p.excludeFines === 'boolean' &&
    p.oncePerCharge === true &&
    typeof p.declarationAttested === 'boolean' &&
    (p.declarationRef === null || typeof p.declarationRef === 'string')
  )
}

/**
 * Can this policy charge anything at all? On, attested, with an amount,
 * and inside the state rule. The job charges nothing otherwise.
 */
export function policyCharges(policy: LateFeePolicy, law: LateFeeLaw | null): boolean {
  if (!policy.enabled || !policy.declarationAttested) return false
  if (policy.mode === 'percent' ? !policy.percentBps : !policy.flatCents) return false
  return Object.keys(lawErrors(policy, law)).length === 0
}

// ─── per charge ─────────────────────────────────────────────────────

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** YYYY-MM-DD plus n days (UTC calendar arithmetic). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

/** The grace the job applies: the board's, raised to the statute's minimum. */
export function effectiveGraceDays(policy: LateFeePolicy, law: LateFeeLaw | null): number {
  return Math.max(policy.graceDays, law?.minGraceDays ?? 0)
}

/** A charge is late on `today` when its due date plus the grace is before today. Equivalently: due_date < lateCutoff(today). */
export function lateCutoff(today: string, graceDays: number): string {
  return addDays(today, -graceDays)
}

export interface LateFeeCharge {
  assessmentType: string
  dueDate: string
  amountCents: number
  paidCents: number
}

export type LateFeeOutcome =
  | { charge: true; feeCents: number; lateCents: number; capped: boolean }
  | { charge: false; reason: 'off' | 'type' | 'grace' | 'paid' | 'zero' }

/**
 * The one late fee for one charge, or why there is none. The percent is
 * of the amount still unpaid, and the fee never exceeds the state cap on
 * that amount. Idempotency (once per charge) is the job's memo_code.
 */
export function lateFeeForCharge(
  policy: LateFeePolicy,
  law: LateFeeLaw | null,
  charge: LateFeeCharge,
  today: string,
): LateFeeOutcome {
  if (!policyCharges(policy, law)) return { charge: false, reason: 'off' }
  if (!eligibleChargeTypes(policy).includes(charge.assessmentType)) return { charge: false, reason: 'type' }
  if (!DAY_RE.test(charge.dueDate) || !(charge.dueDate < lateCutoff(today, effectiveGraceDays(policy, law)))) {
    return { charge: false, reason: 'grace' }
  }
  const lateCents = charge.amountCents - charge.paidCents
  if (lateCents <= 0) return { charge: false, reason: 'paid' }
  const raw = policy.mode === 'percent' ? Math.round((lateCents * policy.percentBps!) / 10_000) : policy.flatCents!
  const cap = law ? statutoryCapCents(law, lateCents) : null
  const feeCents = cap !== null ? Math.min(raw, cap) : raw
  if (feeCents <= 0) return { charge: false, reason: 'zero' }
  return { charge: true, feeCents, lateCents, capped: cap !== null && raw > cap }
}

/** "5% of the late amount" / "$25.00" */
export function policyAmountLabel(policy: LateFeePolicy): string {
  if (policy.mode === 'percent' && policy.percentBps) return `${policy.percentBps / 100}% of the late amount`
  if (policy.mode === 'flat' && policy.flatCents) return dollars(policy.flatCents)
  return 'no amount set'
}
