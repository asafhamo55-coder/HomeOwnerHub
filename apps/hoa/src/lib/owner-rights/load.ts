import 'server-only'

import { associationTimeZone, todayIn } from '@/lib/association-time'
import { getResidentActor } from '@/lib/impersonation'
import { getResidentUnits } from '@/lib/resident'
import { georgiaScope, type RightsAssociationRow } from './scope'

/**
 * BL-164: is this resident's association a Georgia one, and what day is it
 * there? The rights page and the Documents link read this.
 *
 * Reads only `associations` (id, state, governing_law_state) of the
 * resident's current org: with the RLS-bound client normally (any org
 * member may read its associations, 0063), and with the impersonation
 * client scoped to the impersonated org otherwise. The resident's own
 * homes decide when they have any; otherwise every association of the org.
 */

export type ResidentRightsScope = { ok: true; georgia: boolean; today: string } | { ok: false }

export async function loadResidentRightsScope(orgId: string): Promise<ResidentRightsScope> {
  const [actor, units] = await Promise.all([getResidentActor(), getResidentUnits()])
  const { data, error } = await actor.client
    .from('associations' as never)
    .select('id, state, governing_law_state')
    .eq('organization_id' as never, actor.orgId ?? orgId)
  if (error) {
    console.error('[owner-rights] associations read failed', { code: (error as { code?: string }).code ?? null })
    return { ok: false }
  }
  const rows = (data ?? []) as unknown as RightsAssociationRow[]
  const ids = units.map((u) => u.association_id).filter((id): id is string => !!id)
  return { ok: true, georgia: georgiaScope(rows, ids).length > 0, today: todayIn(associationTimeZone({ state: 'GA' })) }
}
