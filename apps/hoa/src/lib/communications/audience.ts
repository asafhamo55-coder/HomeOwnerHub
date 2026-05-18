import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

/**
 * Audience resolution — turns a high-level filter ("late on dues") into
 * a concrete recipient list (one row per unit with the right contact
 * info). The same `AudienceDefinition` jsonb is also stored on the
 * `communications` row so the recipient explosion is auditable / re-runnable.
 *
 * Resident identity surfaces in three places:
 *   1. units                    — physical addresses
 *   2. ownerships (active)      — current owners (owner_email, owner_phone)
 *   3. tenancies (active)       — current tenants (tenant_email, tenant_phone)
 *
 * For v1 we send to whoever's contact info is on file. Resident accounts
 * (Supabase auth users tied to a unit via owner_user_id / tenant_user_id)
 * get layered in for portal-channel delivery.
 */

export type AudienceKind =
  | 'everyone'                // all units in association
  | 'owners_only'             // active ownerships only
  | 'tenants_only'            // active tenancies only
  | 'late_on_dues'            // assessments past due, not paid
  | 'open_violations'         // unresolved hoa_violations
  | 'specific_units'          // explicit unit_id list

export interface AudienceDefinition {
  kind: AudienceKind
  unitIds?: string[]          // populated when kind = 'specific_units'
  /** Future filters land here without breaking the shape. */
  extra?: Record<string, unknown>
}

export interface ResolvedRecipient {
  unitId: string
  unitAddress: string | null
  unitNumber: string | null
  /** Best display name we have — owner / tenant / "Resident". */
  recipientName: string | null
  email: string | null
  phone: string | null
  /** Supabase user id, if this resident has a portal account. */
  userId: string | null
}

export interface ResolvedAudience {
  recipients: ResolvedRecipient[]
  summary: string             // "All owners in Madison Park (82)"
}

type Db = SupabaseClient<Database>

/**
 * Main entry. Returns the recipient list + a human summary the wizard
 * shows above the Send button. Pulls from associations/units/ownerships/
 * tenancies/assessments/hoa_violations per kind.
 */
export async function resolveAudience(
  db: Db,
  associationId: string,
  def: AudienceDefinition,
): Promise<ResolvedAudience> {
  // Pull the unit roster first; every filter narrows from this set.
  const { data: units } = await db
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('association_id', associationId)

  type UnitRow = { id: string; address_line1: string | null; unit_number: string | null }
  const unitMap = new Map<string, UnitRow>(
    (units ?? []).map((u) => [u.id, u as UnitRow]),
  )

  let candidateUnitIds = [...unitMap.keys()]

  // Per-kind narrowing.
  switch (def.kind) {
    case 'everyone':
      break
    case 'specific_units':
      candidateUnitIds = (def.unitIds ?? []).filter((id) => unitMap.has(id))
      break
    case 'owners_only':
    case 'tenants_only':
      // Both branches resolve below via contact lookup — no narrowing here.
      break
    case 'late_on_dues': {
      const today = new Date().toISOString().slice(0, 10)
      const { data: late } = await db
        .from('assessments')
        .select('unit_id')
        .eq('association_id', associationId)
        .in('status', ['open', 'partial'])
        .lt('due_date', today)
      candidateUnitIds = Array.from(
        new Set((late ?? []).map((r) => r.unit_id)),
      ).filter((id) => unitMap.has(id))
      break
    }
    case 'open_violations': {
      // hoa_violations is keyed by org-level property_id (legacy table),
      // joined to units via units.legacy_hoa_property_id.
      const { data: legacyUnits } = await db
        .from('units')
        .select('id, legacy_hoa_property_id')
        .eq('association_id', associationId)
        .not('legacy_hoa_property_id', 'is', null)
      type LegacyRow = { id: string; legacy_hoa_property_id: string | null }
      const legacy = (legacyUnits ?? []) as LegacyRow[]
      const legacyIds = legacy
        .map((u) => u.legacy_hoa_property_id)
        .filter((id): id is string => !!id)
      if (legacyIds.length === 0) {
        candidateUnitIds = []
        break
      }
      const { data: violations } = await db
        .from('hoa_violations')
        .select('property_id')
        .in('property_id', legacyIds)
        .in('status', ['open', 'notice_sent'])
      const violatingLegacy = new Set(
        (violations ?? []).map((v) => v.property_id),
      )
      candidateUnitIds = legacy
        .filter((u) => u.legacy_hoa_property_id && violatingLegacy.has(u.legacy_hoa_property_id))
        .map((u) => u.id)
      break
    }
  }

  if (candidateUnitIds.length === 0) {
    return { recipients: [], summary: summaryFor(def, 0) }
  }

  // Resolve contact info per unit. Active ownership first; if missing,
  // active tenancy. Either contributes name/email/phone/user_id.
  const [ownerships, tenancies] = await Promise.all([
    db
      .from('ownerships')
      .select('unit_id, owner_name, owner_email, owner_phone, owner_user_id')
      .in('unit_id', candidateUnitIds)
      .is('valid_to', null),
    db
      .from('tenancies')
      .select('unit_id, tenant_name, tenant_email, tenant_phone, tenant_user_id, status')
      .in('unit_id', candidateUnitIds)
      .eq('status', 'active'),
  ])

  type OwnershipRow = {
    unit_id: string
    owner_name: string | null
    owner_email: string | null
    owner_phone: string | null
    owner_user_id: string | null
  }
  type TenancyRow = {
    unit_id: string
    tenant_name: string | null
    tenant_email: string | null
    tenant_phone: string | null
    tenant_user_id: string | null
    status: string | null
  }

  const ownersByUnit = new Map<string, OwnershipRow>(
    ((ownerships.data ?? []) as OwnershipRow[]).map((o) => [o.unit_id, o]),
  )
  const tenantsByUnit = new Map<string, TenancyRow>(
    ((tenancies.data ?? []) as TenancyRow[]).map((t) => [t.unit_id, t]),
  )

  const recipients: ResolvedRecipient[] = []
  for (const unitId of candidateUnitIds) {
    const unit = unitMap.get(unitId)!
    const owner = ownersByUnit.get(unitId)
    const tenant = tenantsByUnit.get(unitId)

    // Audience kind picks WHICH party to address.
    if (def.kind === 'tenants_only') {
      if (!tenant) continue
      recipients.push({
        unitId,
        unitAddress: unit.address_line1,
        unitNumber: unit.unit_number,
        recipientName: tenant.tenant_name ?? 'Resident',
        email: tenant.tenant_email,
        phone: tenant.tenant_phone,
        userId: tenant.tenant_user_id,
      })
      continue
    }
    if (def.kind === 'owners_only') {
      if (!owner) continue
      recipients.push({
        unitId,
        unitAddress: unit.address_line1,
        unitNumber: unit.unit_number,
        recipientName: owner.owner_name ?? 'Owner',
        email: owner.owner_email,
        phone: owner.owner_phone,
        userId: owner.owner_user_id,
      })
      continue
    }
    // Default ('everyone', 'specific_units', 'late_on_dues', 'open_violations'):
    // owner gets the comm by default; tenant gets it if no owner is on file
    // (e.g. for a rental where the owner is absentee and unreachable).
    if (owner) {
      recipients.push({
        unitId,
        unitAddress: unit.address_line1,
        unitNumber: unit.unit_number,
        recipientName: owner.owner_name ?? 'Owner',
        email: owner.owner_email,
        phone: owner.owner_phone,
        userId: owner.owner_user_id,
      })
    } else if (tenant) {
      recipients.push({
        unitId,
        unitAddress: unit.address_line1,
        unitNumber: unit.unit_number,
        recipientName: tenant.tenant_name ?? 'Resident',
        email: tenant.tenant_email,
        phone: tenant.tenant_phone,
        userId: tenant.tenant_user_id,
      })
    } else {
      // No contact info on file — still include the unit so the manager
      // sees it in the recipient list and knows to update records.
      recipients.push({
        unitId,
        unitAddress: unit.address_line1,
        unitNumber: unit.unit_number,
        recipientName: 'Resident (no contact on file)',
        email: null,
        phone: null,
        userId: null,
      })
    }
  }

  return { recipients, summary: summaryFor(def, recipients.length) }
}

function summaryFor(def: AudienceDefinition, count: number): string {
  const noun = count === 1 ? 'recipient' : 'recipients'
  switch (def.kind) {
    case 'everyone':
      return `Everyone in this association (${count} ${noun})`
    case 'owners_only':
      return `Owners only (${count} ${noun})`
    case 'tenants_only':
      return `Tenants only (${count} ${noun})`
    case 'late_on_dues':
      return `Units late on dues (${count} ${noun})`
    case 'open_violations':
      return `Units with open violations (${count} ${noun})`
    case 'specific_units':
      return `${(def.unitIds ?? []).length} hand-picked unit${(def.unitIds ?? []).length === 1 ? '' : 's'} (${count} ${noun})`
  }
}
