/**
 * BL-140 (remainder): cure before the hearing. Pure, client-safe, no clock.
 *
 * When the board marks a violation Resolved while its fine hearing is still
 * requested or scheduled (and not past its date), the hearing card offers to
 * cancel the hearing and record why. Nothing changes until the board
 * presses the button; the server action (./cure-actions.ts) re-checks all
 * of this before it writes.
 *
 * Statute text is quoted ONLY from scripts/fixtures/state-law, checked word
 * for word by cure.test.ts:
 *   FL — Fla. Stat. § 720.305(2)(e) (flsenate-ch720-2026.html).
 *   CA — Cal. Civ. Code § 5855(c), (c)(1), (c)(2) (ca-civ-davis-stirling-2026.txt).
 * Any other state gets "check your governing documents" and no quote.
 *
 * A cancelled hearing no longer counts for the fine gate (hearingFineFacts
 * treats it as no hearing), so in FL and CA the violation can't be fined
 * later without a new hearing.
 *
 * No `@/` imports.
 */

import { normaliseState, type DriftCitation } from '../compliance/statute-drift'
import { CA_5855_CURE, FL_305_CURED, type HearingRecord, type HearingStatus } from './rules'

const CA_FILE = 'ca-civ-davis-stirling-2026.txt'

export const CA_5855_NO_DISCIPLINE: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(c)',
  quote: 'The board shall not impose discipline in either of the following circumstances:',
  fixture: CA_FILE,
}
export const CA_5855_CURED: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(c)(1)',
  quote: 'The member cures the violation prior to the meeting.',
  fixture: CA_FILE,
}
export const CA_5855_COMMITMENT: DriftCitation = {
  cite: 'Cal. Civ. Code § 5855(c)(2)',
  quote:
    'If curing the violation would take longer than the time between the notice provided pursuant to subdivision (a) and the meeting, the member provides financial commitment to cure the violation.',
  fixture: CA_FILE,
}

/** Every quote this module shows: what cure.test.ts checks against the fixtures. */
export const ALL_CURE_CITATIONS: readonly DriftCitation[] = [FL_305_CURED, CA_5855_CURE, CA_5855_NO_DISCIPLINE, CA_5855_CURED, CA_5855_COMMITMENT]

export const CURE_CHECK_GOVERNING_DOCUMENTS =
  'HomeownerHub has no loaded statute text on a cure before the hearing in your state. Check your governing documents, and ask your association’s attorney, before cancelling or holding the hearing.'

/** Why the board cancelled the hearing. Stored as a code in audit_log, nothing else. */
export const CURE_CANCEL_REASONS = ['cured_before_hearing', 'cured_as_noticed', 'cure_commitment', 'board_withdrew'] as const
export type CureCancelReason = (typeof CURE_CANCEL_REASONS)[number]

export const CURE_CANCEL_REASON_LABEL: Record<CureCancelReason, string> = {
  cured_before_hearing: 'The owner fixed the violation before the hearing',
  cured_as_noticed: 'The owner fixed it the way the notice asked',
  cure_commitment: 'The owner made a financial commitment to fix it',
  board_withdrew: 'The board withdrew the proposed fine',
}

export function isCureCancelReason(v: unknown): v is CureCancelReason {
  return typeof v === 'string' && (CURE_CANCEL_REASONS as readonly string[]).includes(v)
}

/** The audit action written when the board cancels a hearing after a cure. */
export const CURE_CANCEL_AUDIT_ACTION = 'violation.hearing_cancelled_cured'

/** Hearing statuses that can still be cancelled for a cure. */
const PENDING: readonly HearingStatus[] = ['requested', 'scheduled']

/** Violation statuses that mean "fixed". `cured` is a legacy value some rows still carry. */
const CURED_STATUSES = new Set(['resolved', 'cured'])

export interface CureBeforeHearingOffer {
  state: string | null
  /** One plain sentence for the board. */
  message: string
  /** Verbatim statute text; empty where none is loaded. */
  citations: DriftCitation[]
  /** Set when the state has no loaded rule. */
  note: string | null
  /** The reasons the board can pick, most likely first. */
  reasons: CureCancelReason[]
}

export interface CureOfferInput {
  state: string | null | undefined
  /** hoa_violations.status */
  violationStatus: string | null | undefined
  /** The association day the violation was resolved (YYYY-MM-DD), if known. */
  resolvedOn: string | null | undefined
  hearing: Pick<HearingRecord, 'status' | 'hearingOn'> | null | undefined
}

/**
 * The offer to cancel the hearing because the violation was cured first;
 * null when there is nothing to offer: no hearing, a hearing already held
 * or cancelled, a violation that isn't resolved, or a cure recorded after
 * the scheduled hearing day (that is not "before the hearing").
 */
export function cureBeforeHearingOffer(input: CureOfferInput): CureBeforeHearingOffer | null {
  const h = input.hearing
  if (!h || !PENDING.includes(h.status)) return null
  if (!input.violationStatus || !CURED_STATUSES.has(input.violationStatus)) return null
  const resolvedOn = typeof input.resolvedOn === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input.resolvedOn) ? input.resolvedOn.slice(0, 10) : null
  if (resolvedOn && h.hearingOn && resolvedOn > h.hearingOn) return null

  const state = normaliseState(input.state)
  if (state === 'FL') {
    return {
      state,
      message:
        'This violation is marked resolved before its hearing. In Florida, a fine can’t be imposed for a violation cured before the hearing, or cured the way the notice asked. Cancel the hearing and record why.',
      citations: [FL_305_CURED],
      note: null,
      reasons: ['cured_before_hearing', 'cured_as_noticed', 'board_withdrew'],
    }
  }
  if (state === 'CA') {
    return {
      state,
      message:
        'This violation is marked resolved before the board’s hearing. In California, the owner may cure before the meeting, and the board can’t impose discipline once they have. Cancel the hearing and record why.',
      citations: [CA_5855_CURE, CA_5855_NO_DISCIPLINE, CA_5855_CURED, CA_5855_COMMITMENT],
      note: null,
      reasons: ['cured_before_hearing', 'cure_commitment', 'board_withdrew'],
    }
  }
  return {
    state,
    message: 'This violation is marked resolved before its hearing. You can cancel the hearing and record why.',
    citations: [],
    note: CURE_CHECK_GOVERNING_DOCUMENTS,
    reasons: ['cured_before_hearing', 'board_withdrew'],
  }
}

/** The audit row's metadata: codes and ids only, never a name, an address or a note. */
export function cureCancelAuditMetadata(input: {
  hearingId: string
  reason: CureCancelReason
  state: string | null
  priorStatus: HearingStatus
}): Record<string, string | null> {
  return { hearing_id: input.hearingId, reason: input.reason, state: input.state, prior_status: input.priorStatus }
}
