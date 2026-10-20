/**
 * Homes with no association (BL-125).
 *
 * `/onboarding` creates the org but no association, so a home added before
 * the association exists is written with `units.association_id = NULL`
 * (`chooseAssociation` → null). Dues generation reads units by
 * `association_id`, so such a home is silently never billed.
 *
 * Two ways they get attached, both through `assignUnassignedHomes`:
 *   - automatically, when the association is set up and it is the org's
 *     ONLY one (`adoptUnassignedHomesIfSingle`, called from
 *     `setUpAssociationCore`) — there is nothing to guess;
 *   - by the board, from the "N homes aren't assigned" notice, which with
 *     several associations asks which one (we never guess between them).
 *
 * Idempotent: only rows still `association_id IS NULL` are touched, so a
 * re-run, a double submit or a race attaches nothing twice and never moves
 * a home that already has an association. Audited with ids and counts
 * only — never an address or a name.
 *
 * Plain functions on the caller's client (RLS decides: units are a board
 * write; audit_log is written as yourself). Not a `'use server'` module.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

type Db = SupabaseClient<Database>

export const UNASSIGNED_HOMES_AUDIT_ACTION = 'units_association_assigned'

/** Where the assignment came from, recorded on the audit row. */
export type AssignSource = 'association_setup' | 'board_bulk_assign'

export interface UnassignedHomes {
  /** Units in the org with no association. */
  count: number
  /** The org's associations, by name — what the board may pick from. */
  associations: Array<{ id: string; name: string }>
}

export type UnassignedLoad = { ok: true; data: UnassignedHomes } | { ok: false }

function logFailure(step: string, error: { code?: string } | null | undefined, ids: Record<string, string | number>): void {
  // Ids and codes only: a PostgREST message can quote row values.
  console.error(`[properties.unassigned] ${step} failed`, { ...ids, code: error?.code ?? 'unknown' })
}

/** How many of the org's homes have no association, and which associations exist. */
export async function loadUnassignedHomes(db: Db, orgId: string): Promise<UnassignedLoad> {
  try {
    const [units, assocs] = await Promise.all([
      db.from('units').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('association_id', null),
      db.from('associations').select('id, name').eq('organization_id', orgId).order('name', { ascending: true }),
    ])
    if (units.error) {
      logFailure('count', units.error, { orgId })
      return { ok: false }
    }
    if (assocs.error) {
      logFailure('associations.read', assocs.error, { orgId })
      return { ok: false }
    }
    return {
      ok: true,
      data: {
        count: units.count ?? 0,
        associations: ((assocs.data ?? []) as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name })),
      },
    }
  } catch (err) {
    logFailure('load', { code: err instanceof Error ? err.name : undefined }, { orgId })
    return { ok: false }
  }
}

export type AssignResult =
  | {
      ok: true
      /** Homes attached by THIS call (0 when there were none left). */
      assigned: number
      /** False when the homes were attached but the audit row failed to write. */
      audited: boolean
    }
  | { ok: false; error: string }

/** The audit row: ids and counts only. */
export function unassignedAuditRow(args: {
  orgId: string
  userId: string
  associationId: string
  source: AssignSource
  unitIds: string[]
}) {
  return {
    action: UNASSIGNED_HOMES_AUDIT_ACTION,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: 'association',
    entity_id: args.associationId,
    metadata: { source: args.source, count: args.unitIds.length, unit_ids: args.unitIds },
  }
}

/**
 * Attach every unit of `orgId` with no association to `associationId`.
 * The association must belong to the org. Touches only rows that are
 * still unassigned, so it is safe to repeat.
 */
export async function assignUnassignedHomes(
  db: Db,
  args: { orgId: string; associationId: string; userId: string; source: AssignSource },
): Promise<AssignResult> {
  const { orgId, associationId } = args

  const assoc = await db
    .from('associations')
    .select('id')
    .eq('id', associationId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (assoc.error) {
    logFailure('association.read', assoc.error, { orgId })
    return { ok: false, error: 'We couldn’t check the association just now. Try again.' }
  }
  if (!assoc.data) return { ok: false, error: 'Choose an association from the list.' }

  const updated = await db
    .from('units')
    .update({ association_id: associationId })
    .eq('organization_id', orgId)
    .is('association_id', null)
    .select('id')
  if (updated.error) {
    logFailure('units.update', updated.error, { orgId, associationId })
    return {
      ok: false,
      error:
        updated.error.code === '42501'
          ? 'Only the board can assign homes to an association.'
          : 'We couldn’t assign the homes just now. Try again.',
    }
  }
  const unitIds = ((updated.data ?? []) as Array<{ id: string }>).map((u) => u.id)
  if (unitIds.length === 0) return { ok: true, assigned: 0, audited: true }

  const audit = await db.from('audit_log').insert(unassignedAuditRow({ ...args, unitIds }))
  if (audit.error) {
    logFailure('audit.insert', audit.error, { orgId, associationId, count: unitIds.length })
    return { ok: true, assigned: unitIds.length, audited: false }
  }
  console.info('[properties.unassigned] assigned', { orgId, associationId, source: args.source, count: unitIds.length })
  return { ok: true, assigned: unitIds.length, audited: true }
}

export type AdoptResult =
  | { ok: true; assigned: number; skipped?: 'several_associations' }
  | { ok: false; error: string }

/**
 * Association setup: attach the org's unassigned homes only when this is
 * the org's one association. With several, nothing is guessed — the board
 * gets the notice and picks.
 */
export async function adoptUnassignedHomesIfSingle(
  db: Db,
  args: { orgId: string; associationId: string; userId: string },
): Promise<AdoptResult> {
  const count = await db
    .from('associations')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', args.orgId)
  if (count.error) {
    logFailure('associations.count', count.error, { orgId: args.orgId })
    return { ok: false, error: 'We couldn’t check your associations just now.' }
  }
  if ((count.count ?? 0) !== 1) return { ok: true, assigned: 0, skipped: 'several_associations' }

  const res = await assignUnassignedHomes(db, { ...args, source: 'association_setup' })
  return res.ok ? { ok: true, assigned: res.assigned } : res
}

/** "3 homes aren't" / "1 home isn't" — the notice headline. */
export function unassignedHeadline(count: number): string {
  return count === 1
    ? '1 home isn’t assigned to an association'
    : `${count.toLocaleString('en-US')} homes aren’t assigned to an association`
}
