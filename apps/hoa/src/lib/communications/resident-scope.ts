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
  /** Effective auth user id, null for an impersonated account-less owner. */
  userId: string | null
  email: string | null
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
  userId,
  email,
}: ResidentIdentity): string[] {
  const filters: string[] = []
  if (unitIds.length > 0) filters.push(`unit_id.in.(${unitIds.join(',')})`)
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
