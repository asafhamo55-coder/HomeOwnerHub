import { complianceState } from '@/lib/compliance/deadlines'

/** BL-164: an association row as the rights scope reads it. */
export interface RightsAssociationRow {
  id: string
  state: string | null
  governing_law_state: string | null
}

/** Pure: the Georgia rows among the resident's homes' associations (or all, with no home). */
export function georgiaScope(rows: readonly RightsAssociationRow[], unitAssociationIds: readonly string[]): RightsAssociationRow[] {
  const mine = unitAssociationIds.length > 0 ? rows.filter((r) => unitAssociationIds.includes(r.id)) : rows
  return mine.filter((r) => complianceState(r.governing_law_state, r.state) === 'GA')
}
