/**
 * BL-142: what the board learns from the policies on record beyond the
 * expiry countdown (BL-132, ./model.ts).
 *
 *  1. Renewal comparison — a policy against its previous term: premium,
 *     limit and deductible, each change marked better or worse for the
 *     association.
 *  2. Fidelity-bond adequacy — the bond's limit against the money the
 *     books say the association holds today (reserve balance plus
 *     operating cash).
 *  3. The owner-facing summary — policy types, carriers, limits and
 *     deductibles. Never premiums, never policy numbers.
 *
 * Pure and import-free apart from ./model. No clock: callers pass the
 * association's today (YYYY-MM-DD).
 *
 * "Previous term" without a column (no migration): insurance_policies has
 * no renewed_from link, so a predecessor is found by matching — same kind,
 * same association, same carrier (case, spacing and punctuation ignored),
 * and adjacent dates: the newer policy starts within one day either side
 * of the older one's expiry. A renewal that changed carrier, or a policy
 * with no start date recorded, therefore has no comparison; the page says
 * so rather than guess.
 */

import {
  CHECK_GOVERNING_DOCUMENTS,
  FL_3033_AMOUNT,
  daysFrom,
  isActive,
  type InsuranceCitation,
  type InsurancePolicy,
  type PolicyKind,
} from './model'

// ─── 1. renewal comparison ───────────────────────────────────────────

/** How far either side of the old expiry the renewal may start, in days. */
export const RENEWAL_ADJACENT_DAYS = 1

/** Carrier names compared loosely: "Acme Mutual, Inc." = "acme mutual inc". */
export function carrierKey(carrier: string): string {
  return carrier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The previous term of `p`: same kind, association and carrier, ending
 * within RENEWAL_ADJACENT_DAYS of `p`'s start. null when `p` has no start
 * date or nothing matches. Several matches (a duplicate entry): the one
 * whose expiry is closest to `p`'s start, then the latest-expiring.
 */
export function previousTerm(p: InsurancePolicy, all: readonly InsurancePolicy[]): InsurancePolicy | null {
  if (!p.effectiveOn) return null
  const key = carrierKey(p.carrier)
  if (!key) return null
  let best: { policy: InsurancePolicy; gap: number } | null = null
  for (const q of all) {
    if (q.id === p.id || q.kind !== p.kind || q.associationId !== p.associationId) continue
    if (carrierKey(q.carrier) !== key) continue
    // The older policy must actually end before the newer one does.
    const later = daysFrom(q.expiresOn, p.expiresOn)
    if (later === null || later <= 0) continue
    const gap = daysFrom(q.expiresOn, p.effectiveOn)
    if (gap === null || Math.abs(gap) > RENEWAL_ADJACENT_DAYS) continue
    const g = Math.abs(gap)
    if (!best || g < best.gap || (g === best.gap && q.expiresOn > best.policy.expiresOn)) best = { policy: q, gap: g }
  }
  return best?.policy ?? null
}

export type ChangeField = 'premium' | 'limit' | 'deductible'
/** better/worse are from the association's side: a lower premium is better, a lower limit worse. */
export type ChangeDirection = 'better' | 'worse' | 'same' | 'unknown'

export interface TermChange {
  field: ChangeField
  label: string
  previousCents: number | null
  currentCents: number | null
  /** current − previous; null when either side is not recorded. */
  deltaCents: number | null
  /** Change as a share of the previous value (0.12 = +12%); null when not computable. */
  pct: number | null
  direction: ChangeDirection
}

export interface RenewalComparison {
  current: InsurancePolicy
  previous: InsurancePolicy
  changes: TermChange[]
  /** At least one change is worse for the association (premium up, limit down, deductible up). */
  hasWorse: boolean
}

const FIELD_LABEL: Record<ChangeField, string> = { premium: 'Premium', limit: 'Limit', deductible: 'Deductible' }
/** +1: an increase is better for the association; −1: an increase is worse. */
const UP_IS: Record<ChangeField, 1 | -1> = { premium: -1, limit: 1, deductible: -1 }

export function termChange(field: ChangeField, previousCents: number | null, currentCents: number | null): TermChange {
  const base = { field, label: FIELD_LABEL[field], previousCents, currentCents }
  if (previousCents === null || currentCents === null) {
    return { ...base, deltaCents: null, pct: null, direction: 'unknown' }
  }
  const deltaCents = currentCents - previousCents
  const pct = previousCents === 0 ? null : deltaCents / previousCents
  const direction: ChangeDirection = deltaCents === 0 ? 'same' : Math.sign(deltaCents) === UP_IS[field] ? 'better' : 'worse'
  return { ...base, deltaCents, pct, direction }
}

export function compareTerms(current: InsurancePolicy, previous: InsurancePolicy): RenewalComparison {
  const changes = [
    termChange('premium', previous.premiumCents, current.premiumCents),
    termChange('limit', previous.coverageLimitCents, current.coverageLimitCents),
    termChange('deductible', previous.deductibleCents, current.deductibleCents),
  ]
  return { current, previous, changes, hasWorse: changes.some((c) => c.direction === 'worse') }
}

/**
 * One comparison per policy that is in force or not yet started on
 * `today` and has a previous term on record. Policies that have already
 * ended are history, not renewals to review. Soonest start first.
 */
export function renewalComparisons(policies: readonly InsurancePolicy[], today: string): RenewalComparison[] {
  const out: RenewalComparison[] = []
  for (const p of policies) {
    const left = daysFrom(today, p.expiresOn)
    if (left === null || left < 0) continue
    const prev = previousTerm(p, policies)
    if (prev) out.push(compareTerms(p, prev))
  }
  return out.sort((a, b) => (a.current.effectiveOn ?? '').localeCompare(b.current.effectiveOn ?? ''))
}

/** "+12.5%" / "−3%" / null. */
export function formatPct(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null
  const v = Math.round(pct * 1000) / 10
  if (v === 0) return '0%'
  return `${v > 0 ? '+' : '−'}${Math.abs(v)}%`
}

// ─── 2. fidelity-bond adequacy ───────────────────────────────────────

export type FidelityStatus = 'covered' | 'short' | 'unknown'

export interface FidelityAdequacy {
  status: FidelityStatus
  /** The active fidelity bonds' combined limit; null when no active bond records a limit. */
  bondLimitCents: number | null
  reserveCents: number | null
  operatingCents: number | null
  /** reserve + operating, what the books say is held today. null when neither is known. */
  heldCents: number | null
  /** held − bond limit when short. */
  shortfallCents: number | null
  /** 'warn' only where loaded statute text sets the amount (FL). */
  severity: 'warn' | 'info'
  message: string
  citations: InsuranceCitation[]
}

export interface FidelityInput {
  state: string | null | undefined
  policies: readonly InsurancePolicy[]
  today: string
  /** Reserve-fund balance in dollars (lib/accounting/reserves.ts); null = no reserve fund or not loaded. */
  reserveBalance: number | null
  /** Operating cash in dollars (account 1010); null = not on the books or not loaded. */
  operatingCash: number | null
}

const toCents = (dollars: number | null): number | null =>
  dollars === null || !Number.isFinite(dollars) ? null : Math.round(dollars * 100)

/**
 * The bond's limit against the money held today. Florida's § 720.3033(5)
 * sets the amount (the most money held at any one time), quoted verbatim
 * from the fixture; today's balance is a floor for that, never the
 * maximum, so "covered" still says to check the year's peak. Elsewhere no
 * statute text is loaded, so the comparison is shown as information and
 * the requirement is "check your governing documents".
 *
 * null when there is no active fidelity bond: the coverage check already
 * says that (and what Florida requires).
 */
export function fidelityAdequacy(input: FidelityInput): FidelityAdequacy | null {
  const bonds = input.policies.filter((p) => p.kind === 'fidelity' && isActive(p, input.today))
  if (bonds.length === 0) return null
  const limits = bonds.map((b) => b.coverageLimitCents).filter((c): c is number => c !== null)
  const bondLimitCents = limits.length ? limits.reduce((s, c) => s + c, 0) : null
  const reserveCents = toCents(input.reserveBalance)
  const operatingCents = toCents(input.operatingCash)
  const heldCents = reserveCents === null && operatingCents === null ? null : (reserveCents ?? 0) + (operatingCents ?? 0)
  const fl = (input.state ?? '').trim().toUpperCase() === 'FL'
  const citations = fl ? [FL_3033_AMOUNT] : []
  const requirement = fl
    ? 'Florida requires the bond to cover the most money the association or its manager holds at any one time, so compare it with the year’s highest balance too, not just today’s.'
    : `How much fidelity coverage is required: ${CHECK_GOVERNING_DOCUMENTS}`

  const base = { bondLimitCents, reserveCents, operatingCents, heldCents, citations }
  if (bondLimitCents === null) {
    return {
      ...base,
      status: 'unknown',
      shortfallCents: null,
      severity: fl ? 'warn' : 'info',
      message: `The fidelity bond on record has no limit entered, so it can’t be compared with the money the association holds. Add the limit from the declarations page. ${requirement}`,
    }
  }
  if (heldCents === null) {
    return {
      ...base,
      status: 'unknown',
      shortfallCents: null,
      severity: 'info',
      message: `The books show no reserve or operating cash balance to compare the bond with. ${requirement}`,
    }
  }
  if (heldCents > bondLimitCents) {
    return {
      ...base,
      status: 'short',
      shortfallCents: heldCents - bondLimitCents,
      severity: fl ? 'warn' : 'info',
      message: `The association holds more today than the fidelity bond covers. ${requirement}`,
    }
  }
  return {
    ...base,
    status: 'covered',
    shortfallCents: null,
    severity: 'info',
    message: `The fidelity bond covers what the association holds today. ${requirement}`,
  }
}

// ─── 3. owner-facing summary ─────────────────────────────────────────

/**
 * What an owner may see of a policy. Built field by field, so a premium
 * or policy number on the source row can never reach the resident page.
 */
export interface OwnerPolicySummary {
  id: string
  associationId: string | null
  kind: PolicyKind
  carrier: string
  coverageLimitCents: number | null
  deductibleCents: number | null
  expiresOn: string
}

/** Policies in force on `today`, in a stable kind order, with only owner-safe fields. */
export function ownerPolicySummaries(
  policies: readonly InsurancePolicy[],
  today: string,
  kindOrder: readonly PolicyKind[],
): OwnerPolicySummary[] {
  const rank = (k: PolicyKind) => {
    const i = kindOrder.indexOf(k)
    return i === -1 ? kindOrder.length : i
  }
  return policies
    .filter((p) => isActive(p, today))
    .map((p) => ({
      id: p.id,
      associationId: p.associationId,
      kind: p.kind,
      carrier: p.carrier,
      coverageLimitCents: p.coverageLimitCents,
      deductibleCents: p.deductibleCents,
      expiresOn: p.expiresOn,
    }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.carrier.localeCompare(b.carrier))
}
