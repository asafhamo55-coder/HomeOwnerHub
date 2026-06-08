import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { createAdminClient } from '@homeowner-portal/db'

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
  | 'specific_residents'      // explicit property_resident_id list
  | 'board'                   // HOA board members (org_members role='board')
  | 'manual_emails'           // typed-in email addresses (vendors, attorneys, etc.)

export interface AudienceDefinition {
  kind: AudienceKind
  unitIds?: string[]          // populated when kind = 'specific_units'
  /** Populated when kind = 'specific_residents'. Each id refers to a
   *  row in property_residents (the canonical "who lives here" table
   *  from migration 0017). Lets the sender pick a specific named
   *  person — or several named people at one property — instead of
   *  the broad "owner/tenant role" buckets. */
  residentIds?: string[]
  /** Populated when kind = 'board'. Subset of board-member user_ids the
   *  sender hand-picked. Absent / empty ⇒ every board member of the org.
   *  Each id is an org_members.user_id with role='board'. */
  boardUserIds?: string[]
  /** Populated when kind = 'manual_emails'. Free-form email addresses
   *  typed by the sender — used for one-off comms to people not in the
   *  property roster (HOA attorney, a specific vendor, an architect,
   *  etc.). Each entry becomes a recipient with no unit binding. */
  emails?: string[]
  /** Optional per-email display names paired by index with `emails`.
   *  Length mismatch is tolerated — missing names default to the
   *  local-part of the email. */
  emailNames?: string[]
  /** Populated when kind = 'manual_emails'. US phone numbers (E.164 or
   *  raw digits) paired by index with `emails`. Enables SMS delivery to
   *  manually-entered contacts alongside email. */
  phones?: string[]
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
  // Per-resident targeting is a different code path entirely — we go
  // through property_residents (the canonical resident roster) rather
  // than the ownerships/tenancies tables. Short-circuit here so the
  // rest of the function can stay focused on unit-level audiences.
  if (def.kind === 'specific_residents') {
    return resolveSpecificResidents(db, def.residentIds ?? [])
  }

  // Board members — org-level audience (org_members), not unit-level.
  // Resolved through the service-role client because reading other
  // members' profiles / auth emails is blocked by RLS for the
  // user-bound client. Short-circuit here for the same reason as
  // specific_residents.
  if (def.kind === 'board') {
    return resolveBoard(db, associationId, def.boardUserIds)
  }

  // Manual email/phone addresses — no DB lookup at all. Recipients are
  // constructed in-memory from the typed-in list. No unit binding.
  if (def.kind === 'manual_emails') {
    return resolveManualContacts(def.emails ?? [], def.emailNames ?? [], def.phones ?? [])
  }

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
    case 'specific_residents': {
      const n = (def.residentIds ?? []).length
      return `${n} hand-picked resident${n === 1 ? '' : 's'} (${count} ${noun})`
    }
    case 'board': {
      const picked = (def.boardUserIds ?? []).length
      return picked > 0
        ? `${picked} hand-picked board member${picked === 1 ? '' : 's'} (${count} ${noun})`
        : `HOA board (${count} ${noun})`
    }
    case 'manual_emails': {
      const n = (def.emails ?? []).length
      return `${n} manually-entered email${n === 1 ? '' : 's'} (${count} ${noun})`
    }
  }
}

/**
 * Manual contacts audience. The sender typed in email addresses and/or
 * phone numbers directly — no resident or unit context. Useful for
 * one-off comms to people not in the property roster.
 *
 * Each index across emails/names/phones represents one contact.
 * A contact must have at least an email or a phone to be included.
 */
function resolveManualContacts(
  emails: string[],
  names: string[],
  phones: string[],
): ResolvedAudience {
  const seen = new Set<string>()
  const recipients: ResolvedRecipient[] = []
  const maxLen = Math.max(emails.length, phones.length)
  for (let i = 0; i < maxLen; i++) {
    const email = (emails[i] ?? '').trim().toLowerCase() || null
    const phone = normalizeUsPhone(phones[i] ?? '') || null
    if (!email && !phone) continue
    const dedupeKey = email ?? phone ?? ''
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    const nameFromEmail = email ? (email.split('@')[0] ?? email) : null
    const recipientName = names[i]?.trim() || nameFromEmail || phone || 'Recipient'
    recipients.push({
      unitId: `manual:${dedupeKey}`,
      unitAddress: null,
      unitNumber: null,
      recipientName,
      email,
      phone,
      userId: null,
    })
  }
  return {
    recipients,
    summary: summaryFor(
      { kind: 'manual_emails', emails, emailNames: names, phones },
      recipients.length,
    ),
  }
}

function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (raw.startsWith('+1') && digits.length === 11) return `+${digits}`
  return null
}

/**
 * Per-resident audience. Direct lookup by property_residents.id —
 * no unit-level narrowing. Used by the "Specific property" flow in
 * the wizard where the sender hand-picks named people at one (or
 * more) properties.
 *
 * Returns ResolvedRecipient shaped the same as the unit-level path so
 * the downstream send pipeline doesn't care which audience kind built
 * the list. unit_id is best-effort: we look up the unit via
 * units.legacy_hoa_property_id → property_residents.property_id so
 * delivery analytics can still tie back to a unit when available.
 */
async function resolveSpecificResidents(
  db: Db,
  residentIds: string[],
): Promise<ResolvedAudience> {
  if (residentIds.length === 0) {
    return { recipients: [], summary: summaryFor({ kind: 'specific_residents', residentIds: [] }, 0) }
  }

  const { data: residents } = await db
    .from('property_residents' as never)
    .select('id, property_id, full_name, email, phone, role')
    .in('id', residentIds)
    .is('moved_out_at', null)

  type ResidentRow = {
    id: string
    property_id: string
    full_name: string | null
    email: string | null
    phone: string | null
    role: string | null
  }
  const rows = (residents ?? []) as unknown as ResidentRow[]
  if (rows.length === 0) {
    return { recipients: [], summary: summaryFor({ kind: 'specific_residents', residentIds }, 0) }
  }

  // Best-effort unit lookup via the legacy_hoa_property_id bridge.
  // If the bridge isn't populated for a property, unit_id stays null —
  // delivery still works because we have name/email/phone directly.
  const propertyIds = Array.from(new Set(rows.map((r) => r.property_id)))
  const { data: bridgeRows } = await db
    .from('units' as never)
    .select('id, legacy_hoa_property_id, address_line1, unit_number')
    .in('legacy_hoa_property_id', propertyIds)
  type BridgeRow = {
    id: string
    legacy_hoa_property_id: string | null
    address_line1: string | null
    unit_number: string | null
  }
  const unitByProperty = new Map<string, BridgeRow>(
    ((bridgeRows ?? []) as unknown as BridgeRow[])
      .filter((b) => b.legacy_hoa_property_id)
      .map((b) => [b.legacy_hoa_property_id as string, b]),
  )

  const recipients: ResolvedRecipient[] = rows.map((r) => {
    const unit = unitByProperty.get(r.property_id)
    return {
      unitId: unit?.id ?? r.property_id, // fall back to property_id so the row still has a stable id
      unitAddress: unit?.address_line1 ?? null,
      unitNumber: unit?.unit_number ?? null,
      recipientName: r.full_name ?? roleLabel(r.role),
      email: r.email,
      phone: r.phone,
      userId: null, // property_residents doesn't carry a user_id; portal delivery falls back to email
    }
  })

  return {
    recipients,
    summary: summaryFor({ kind: 'specific_residents', residentIds }, recipients.length),
  }
}

function roleLabel(role: string | null): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'tenant': return 'Tenant'
    case 'family_member': return 'Family member'
    case 'other': return 'Resident'
    default: return 'Resident'
  }
}

// ─── Board audience ───────────────────────────────────────────────────

export type BoardRole = 'board' | 'admin'

export interface BoardMember {
  userId: string
  fullName: string
  email: string | null
  /** 'board' or 'admin'. The picker checks board members by default and
   *  offers admins as an opt-in (unchecked) extra. */
  role: BoardRole
}

/**
 * Org members eligible for the board audience. Shared by the pickers
 * (via the listBoardMembers server action) and the send-time resolver
 * so the two never drift on who "the board" is.
 *
 * `roles` controls which org_members roles are returned — defaults to
 * just ['board'] (the audience's canonical meaning), but the pickers ask
 * for ['board','admin'] so admins can be hand-added to a send.
 *
 * Reading the matching profiles / auth emails requires the service-role
 * client — profiles RLS restricts SELECT to the caller's own row, so a
 * user-bound client would see every other member as email-less. Same
 * pattern as events-alerts.ts and members.ts → listMembers.
 */
export async function fetchBoardMembers(
  orgId: string,
  roles: BoardRole[] = ['board'],
): Promise<BoardMember[]> {
  const admin = createAdminClient()

  const { data: memberRows } = await admin
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', roles)

  const rows = ((memberRows ?? []) as Array<{ user_id: string; role: string }>).filter(
    (m) => m.user_id,
  )
  if (rows.length === 0) return []
  const roleById = new Map<string, BoardRole>(
    rows.map((m) => [m.user_id, m.role === 'admin' ? 'admin' : 'board']),
  )
  const userIds = [...roleById.keys()]

  // Names + emails from profiles; auth.users backfills any member whose
  // profile email hasn't been populated yet.
  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .in('id', userIds)
  type ProfileRow = { id: string; email: string | null; full_name: string | null }
  const profileById = new Map<string, ProfileRow>(
    ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  )

  const needsEmail = userIds.filter((id) => !profileById.get(id)?.email)
  const authEmail = new Map<string, string>()
  if (needsEmail.length > 0) {
    try {
      const { data: list } = await admin.auth.admin.listUsers()
      for (const u of list?.users ?? []) {
        if (u.id && u.email) authEmail.set(u.id, u.email)
      }
    } catch {
      // Non-fatal — a member with no resolvable email just resolves to
      // email=null and is reachable only via the portal channel.
    }
  }

  return userIds
    .map((id) => {
      const p = profileById.get(id)
      const email = p?.email ?? authEmail.get(id) ?? null
      const fullName = p?.full_name ?? (email ? (email.split('@')[0] ?? email) : '(no name)')
      return { userId: id, fullName, email, role: roleById.get(id) ?? 'board' }
    })
    // Board members first (the default-checked set), then admins; each
    // group alphabetical.
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'board' ? -1 : 1
      return a.fullName.localeCompare(b.fullName)
    })
}

/**
 * Board audience resolver. Board membership is org-scoped, so we first
 * map the association to its org (readable by the user-bound client),
 * then fetch the board roster via the service-role client.
 *
 * boardUserIds narrows to a hand-picked subset; absent/empty means the
 * whole board (role='board' only — admins are never swept in implicitly,
 * only when explicitly listed in boardUserIds). Recipients carry userId
 * (enabling the in-app portal channel) and email; phone is always null
 * because profiles holds no phone number, so SMS is a no-op for board.
 */
async function resolveBoard(
  db: Db,
  associationId: string,
  boardUserIds: string[] | undefined,
): Promise<ResolvedAudience> {
  const { data: assoc } = await db
    .from('associations')
    .select('organization_id')
    .eq('id', associationId)
    .maybeSingle()
  const orgId = (assoc as { organization_id: string } | null)?.organization_id
  if (!orgId) {
    return { recipients: [], summary: summaryFor({ kind: 'board', boardUserIds }, 0) }
  }

  const hasSubset = !!(boardUserIds && boardUserIds.length > 0)
  // A hand-picked subset may include admins, so pull both roles and then
  // filter. With no subset, the audience is strictly the board role.
  let members = await fetchBoardMembers(orgId, hasSubset ? ['board', 'admin'] : ['board'])
  if (hasSubset) {
    const allow = new Set(boardUserIds)
    members = members.filter((m) => allow.has(m.userId))
  }

  const recipients: ResolvedRecipient[] = members.map((m) => ({
    unitId: `board:${m.userId}`, // synthetic id — nulled out on recipient insert
    unitAddress: null,
    unitNumber: null,
    recipientName: m.fullName,
    email: m.email,
    phone: null, // profiles carries no phone → board SMS skips
    userId: m.userId, // enables the in-app portal channel
  }))

  return {
    recipients,
    summary: summaryFor({ kind: 'board', boardUserIds }, recipients.length),
  }
}
