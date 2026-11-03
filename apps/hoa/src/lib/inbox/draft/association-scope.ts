import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'

/**
 * Which association a drafting call may search governing documents, state law
 * and past replies for, when the thread is not filed under a home.
 *
 * Exactly one association in the org: it is the only possible scope, so use
 * it. Several: guessing would quote one community's rules to another, so the
 * draft stays degraded and the board is asked to link the message to a home.
 * Pure of Next and cookies so it runs from a service-role context too.
 */
export type OrgAssociationScope =
  | { status: 'one'; associationId: string; state: string | null }
  | { status: 'many' }
  | { status: 'none' }
  | { status: 'error' }

export async function resolveOrgAssociationScope(
  db: SupabaseClient<Database>,
  orgId: string,
): Promise<OrgAssociationScope> {
  const { data, error } = await db.from('associations').select('id, state').eq('organization_id', orgId).limit(2)
  if (error) {
    console.error(`resolveOrgAssociationScope: lookup failed: ${error.code} ${error.message}`)
    return { status: 'error' }
  }
  const rows = (data ?? []) as Array<{ id: string; state: string | null }>
  if (rows.length === 0) return { status: 'none' }
  if (rows.length > 1) return { status: 'many' }
  return { status: 'one', associationId: rows[0]!.id, state: rows[0]!.state ?? null }
}

/** True when a draft for an unfiled thread is degraded because the org has several associations. */
export function needsHomeLink(scope: OrgAssociationScope, threadHasUnit: boolean): boolean {
  return !threadHasUnit && scope.status === 'many'
}

export const LINK_HOME_NOTE = 'Link this message to a home for better drafts'
