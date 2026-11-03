/**
 * Scoping rules for the resident-facing announcements feed.
 *
 * Extracted from the page rather than inlined because this is the check
 * that decides which communications one resident may read. The screen
 * previously selected every `communications` row in the organization and
 * filtered only on `status = 'sent'`, so residents could read messages
 * addressed to other owners' units.
 *
 * The reach-through is `communication_recipients`: the send pipeline
 * writes one row per (recipient x channel), so a resident may read a
 * communication exactly when they have such a row for it.
 *
 * This cannot be left to RLS. `getResidentActor` returns a SERVICE-ROLE
 * client while an admin impersonates an owner, and service-role bypasses
 * row-level security entirely — so the boundary has to be in the query.
 */

export interface ResidentIdentity {
  /** Units the reader currently owns. */
  unitIds: string[]
  /**
   * Per-unit first day the reader may see (ResidentUnit.charges_from).
   * Unit-matched rows sent before it belong to the previous owner and are
   * ignored; user and email matches are unaffected.
   */
  unitChargesFrom?: Record<string, string | null | undefined>
  /** Effective auth user id, null for an impersonated account-less owner. */
  userId: string | null
  email: string | null
}

const CUTOFF_SHAPE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** A date or ISO timestamp that is safe to put in a PostgREST filter value. */
function isSafeCutoff(value: string): boolean {
  return CUTOFF_SHAPE.test(value) && !Number.isNaN(Date.parse(value))
}

/**
 * The `unitChargesFrom` map for a resident's units (ResidentUnit.charges_from):
 * a buyer's window opens on the sale date, so the seller's mail stays hidden.
 * Units with no window are left out and see their whole history.
 */
export function chargesFromByUnit(
  units: ReadonlyArray<{ unit_id: string; charges_from?: string | null }>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const u of units) if (u.unit_id && u.charges_from) out[u.unit_id] = u.charges_from
  return out
}

/**
 * PostgREST `or()` clauses matching delivery rows belonging to this
 * reader. Three independent ways a row can be theirs: their unit was in
 * the audience, their account was targeted, or a manager typed their
 * address by hand (which leaves both unit_id and user_id null).
 *
 * An EMPTY result means the reader has no identity to match on, and the
 * caller MUST skip the query rather than pass an empty or() — PostgREST
 * treats that as no constraint, which would return everything and
 * reintroduce exactly the leak this module exists to close.
 */
export function buildRecipientIdentityFilters({
  unitIds,
  unitChargesFrom,
  userId,
  email,
}: ResidentIdentity): string[] {
  const filters: string[] = []
  const open: string[] = []
  const bounded: string[] = []
  for (const id of unitIds) {
    const from = unitChargesFrom?.[id]
    if (!from) {
      open.push(id)
      continue
    }
    // Only a plain date or an ISO timestamp (Z or an offset) goes into the
    // clause. Anything else drops the unit: failing closed beats widening
    // the match.
    if (isSafeCutoff(from)) {
      bounded.push(`and(unit_id.eq.${id},sent_at.gte.${from})`)
    }
  }
  if (open.length > 0) filters.push(`unit_id.in.(${open.join(',')})`)
  filters.push(...bounded)
  if (userId) filters.push(`user_id.eq.${userId}`)
  // Quoted because or() splits on commas: an unquoted address carrying
  // one would silently become two filters, the second of them garbage.
  if (email) filters.push(`email.eq."${email}"`)
  return filters
}

export interface RecipientRow {
  communication_id: string
  rendered_subject: string | null
  unit_id: string | null
  sent_at: string | null
}

/**
 * One delivery row per communication, preferring whichever carries a
 * rendered subject.
 *
 * A reader on both email and portal has two rows for the same message —
 * the same announcement, not two. The row that was actually sent is the
 * one holding the subject they saw, so it wins; a row that never sent
 * (queued, or its render threw) has none and must not displace it.
 *
 * Insertion order is preserved, so the caller's `sent_at` ordering
 * survives into the map.
 */
export function pickRowPerCommunication(rows: RecipientRow[]): Map<string, RecipientRow> {
  const byComm = new Map<string, RecipientRow>()
  for (const r of rows) {
    if (!r.communication_id) continue
    const existing = byComm.get(r.communication_id)
    if (!existing || (!existing.rendered_subject && r.rendered_subject)) {
      byComm.set(r.communication_id, r)
    }
  }
  return byComm
}
