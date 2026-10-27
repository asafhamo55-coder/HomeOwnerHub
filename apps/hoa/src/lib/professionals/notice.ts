// BL-168 follow-up — who is told about what a professional sends, and which
// grants are running out. Pure and dependency-free (no imports at all): the
// daily-digest job in packages/jobs and the Approvals badge load it by
// relative path, like lib/inbox/waiting.ts. Everything here sits behind
// M6_APPLIED at the callers; with the flag off nothing calls it.

/** Approval action types a CPA submits that the Treasurer reviews first. Keep in step with PRO_ACTIONS (model.ts); notice.test.ts compares. */
export const TREASURER_ROUTED_ACTIONS: readonly string[] = ['pro.journal_entry', 'pro.cpa_review']

export interface MemberLike {
  user_id: string
  role: string
  officer_title: string | null
}

/**
 * Who sees a CPA's proposed entry or "reviewed" note: the Treasurer (a board
 * member whose officer title is treasurer), or, when the board has no
 * Treasurer, the admins. Residents and outside professionals are never in
 * the set. Org scoping is the caller's: pass one org's members.
 */
export function treasurerRecipientIds(members: readonly MemberLike[]): Set<string> {
  const treasurers = members.filter((m) => m.role === 'board' && m.officer_title === 'treasurer').map((m) => m.user_id)
  if (treasurers.length > 0) return new Set(treasurers)
  return new Set(members.filter((m) => m.role === 'admin').map((m) => m.user_id))
}

/** Grants ending within this many days are "expiring". */
export const PRO_EXPIRY_WARN_DAYS = 30

export interface ProExpiryCounts {
  /** Grants that end within PRO_EXPIRY_WARN_DAYS and have not ended. */
  expiring: number
  /** Grants whose end has passed and are still on the list (renew or remove). */
  expired: number
}

/** Counts of professional grants by expiry, against `nowMs`. A grant with no end date is neither. */
export function proExpiryCounts(rows: ReadonlyArray<{ access_expires_at: string | null }>, nowMs: number): ProExpiryCounts {
  const horizon = nowMs + PRO_EXPIRY_WARN_DAYS * 86_400_000
  let expiring = 0
  let expired = 0
  for (const r of rows) {
    if (!r.access_expires_at) continue
    const t = Date.parse(r.access_expires_at)
    if (Number.isNaN(t)) continue
    if (t <= nowMs) expired += 1
    else if (t <= horizon) expiring += 1
  }
  return { expiring, expired }
}
