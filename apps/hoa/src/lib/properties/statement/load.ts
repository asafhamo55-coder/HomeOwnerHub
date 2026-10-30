import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { buildLedger, loadLedgerRows, loadUnappliedCredits, type Ledger } from '@/lib/resident-ledger'
import { todayIn } from '@/lib/association-time'
import { readRosterAssociations } from '../statutory-roster/load'
import { resolveUnitForProperty, type PropertyId } from '../resolve'

/**
 * One home's ledger for the board-side owner statement, read with the
 * caller's cookie-bound client so RLS applies on top of the org filter.
 * Read-only. Throws on any failed read (a statement must never be built
 * from a partial ledger); `null` when the home is not in the org.
 *
 * It uses the same read and the same buildLedger as the resident's
 * statement, so the two can never disagree on a figure.
 */
export interface OwnerStatementData {
  ledger: Ledger
  truncated: boolean
  /** The association's today. */
  today: string
  associationName: string | null
  /** The owner of record, name only. */
  ownerName: string | null
  /** "Unit · address", as the resident statement prints it. */
  home: string
  hasUnit: boolean
}

interface PropRow {
  id: string
  address: string | null
  unit_number: string | null
  owner_name: string | null
}

export async function loadOwnerStatement(
  supabase: SupabaseClient,
  orgId: string,
  propertyId: PropertyId,
): Promise<OwnerStatementData | null> {
  const db = supabase as unknown as SupabaseClient<Database>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = supabase as unknown as { from: (t: string) => any }
  const [propRes, unitRes, assoc] = await Promise.all([
    loose
      .from('hoa_properties')
      .select('id, address, unit_number, owner_name')
      .eq('id', propertyId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle() as Promise<{ data: PropRow | null; error: { code?: string } | null }>,
    resolveUnitForProperty(db, orgId, propertyId),
    readRosterAssociations(supabase, orgId),
  ])
  if (propRes.error) throw new Error(`statement: property read failed (${propRes.error.code ?? 'no code'})`)
  const prop = propRes.data
  if (!prop) return null

  const unitIds = unitRes.unitIds as string[]
  let associationId: string | null = null
  if (unitRes.unitId) {
    const { data, error } = await loose
      .from('units')
      .select('association_id')
      .eq('organization_id', orgId)
      .eq('id', unitRes.unitId)
      .maybeSingle()
    if (error) throw new Error(`statement: unit read failed (${error.code ?? 'no code'})`)
    associationId = (data as { association_id: string | null } | null)?.association_id ?? null
  }
  const a = (associationId ? assoc.rows.find((r) => r.id === associationId) : undefined) ?? assoc.primary

  const rows = await loadLedgerRows(db, unitIds, orgId)
  if (!rows.ok) throw new Error('statement: ledger read failed')
  const credits = await loadUnappliedCredits(db, unitIds, orgId)
  if (!credits.ok) throw new Error('statement: credit read failed')

  return {
    ledger: buildLedger(rows.assessments, rows.payments, assoc.timeZone, credits.credits),
    truncated: rows.truncated,
    today: todayIn(assoc.timeZone),
    associationName: a?.name ?? null,
    ownerName: prop.owner_name?.trim() || null,
    home: [prop.unit_number?.trim(), prop.address?.trim()].filter(Boolean).join(' · ') || 'This home',
    hasUnit: unitRes.unitId !== null,
  }
}
