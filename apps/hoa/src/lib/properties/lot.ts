/**
 * Whole-lot writes (C0.3 in docs/research/2026-10-properties-data-model.md).
 *
 * A lot is two rows today: `hoa_properties` (what /properties reads) and
 * `units` + `ownerships` (what dues, audiences, the portal, ARC and tickets
 * read). Nothing in the database keeps them in step, so every write that
 * changes a lot changes BOTH sides here, in one place.
 *
 * This is an app-level dual write, a stopgap until the model converges
 * (phases M1/M2). It has no transaction, so each multi-table write runs
 * its steps in order and, when a later step fails, compensates the
 * earlier ones in REVERSE order (the plaid/exchange pattern): a failure
 * leaves no half lot behind. A compensation step that itself fails is
 * logged by code and id only and never masks the original error.
 *
 * Every function takes the caller's client (RLS-respecting for the board
 * paths) and the caller's org id, and scopes every read and write to that
 * org. Callers gate on board/admin BEFORE building a client.
 *
 * No `'use server'`: these are plain functions, not endpoints.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import {
  asPropertyId,
  asUnitId,
  resolveUnitForProperty,
  unitIdsForProperties,
  type PropertyId,
  type UnitId,
} from './resolve'

type Db = SupabaseClient<Database>

export type LotResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string }

export interface OwnerFields {
  name: string | null
  email: string | null
  phone: string | null
}

export function hasOwner(o: OwnerFields): boolean {
  return Boolean(o.name || o.email || o.phone)
}

/** Log a failure with ids and codes only (no addresses, names or emails). */
function logFailure(step: string, error: unknown, ids: Record<string, string | number | null>): void {
  // Code only: a PostgREST message can quote the offending row's values.
  const e = error as { code?: string } | null
  console.error(`[properties.lot] ${step} failed`, { ...ids, code: e?.code ?? null })
}

/** Run one compensation step; never throws, never masks the original error. */
async function compensate(
  step: string,
  ids: Record<string, string | number | null>,
  run: () => PromiseLike<{ error: unknown }>,
): Promise<void> {
  try {
    const { error } = await run()
    if (error) logFailure(`compensate.${step}`, error, ids)
  } catch (err) {
    logFailure(`compensate.${step}`, err, ids)
  }
}

const laterOf = (a: string, b: string): string => (a > b ? a : b)

// ─── Which association a new lot belongs to ─────────────────────────

/**
 * 0 associations → null (the unit is created unscoped; dues need one).
 * 1 → that one. Several → the caller must choose; a choice outside the
 * org is refused.
 */
export async function chooseAssociation(
  db: Db,
  orgId: string,
  requested: string | null,
): Promise<LotResult<{ associationId: string | null }>> {
  const { data, error } = await db
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })

  if (error) {
    logFailure('associations.read', error, { orgId })
    return { ok: false, error: 'Couldn’t load your communities. Try again.' }
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((a) => a.id)

  if (requested) {
    if (!ids.includes(requested)) {
      return { ok: false, error: 'Choose a community from the list.', field: 'association_id' }
    }
    return { ok: true, data: { associationId: requested } }
  }
  if (ids.length === 0) return { ok: true, data: { associationId: null } }
  if (ids.length === 1) return { ok: true, data: { associationId: ids[0] } }
  return { ok: false, error: 'Choose which community this property belongs to.', field: 'association_id' }
}

// ─── Create ─────────────────────────────────────────────────────────

export interface CreateLotInput {
  orgId: string
  associationId: string | null
  address: string
  unitNumber: string | null
  owner: OwnerFields
  notes: string | null
  /** The association's today, YYYY-MM-DD (the ownership's valid_from). */
  today: string
  userId: string | null
}

export interface CreatedLot {
  propertyId: PropertyId
  unitId: UnitId
  ownershipId: string | null
}

/** hoa_properties → units (bridged) → ownerships (when an owner is given). */
export async function createLot(db: Db, input: CreateLotInput): Promise<LotResult<CreatedLot>> {
  const { orgId } = input

  const { data: prop, error: propErr } = await db
    .from('hoa_properties')
    .insert({
      org_id: orgId,
      address: input.address,
      unit_number: input.unitNumber,
      owner_name: input.owner.name,
      owner_email: input.owner.email,
      owner_phone: input.owner.phone,
      notes: input.notes,
    })
    .select('id')
    .single<{ id: string }>()

  if (propErr || !prop) {
    logFailure('create.hoa_properties', propErr, { orgId })
    return { ok: false, error: 'Couldn’t add the property. Try again.' }
  }
  const propertyId = asPropertyId(prop.id)
  const undoProperty = () =>
    compensate('create.hoa_properties', { orgId, propertyId }, () =>
      db.from('hoa_properties').delete().eq('id', propertyId).eq('org_id', orgId),
    )

  const { data: unit, error: unitErr } = await db
    .from('units')
    .insert({
      organization_id: orgId,
      association_id: input.associationId,
      address_line1: input.address,
      unit_number: input.unitNumber,
      legacy_hoa_property_id: propertyId,
      created_by: input.userId,
    })
    .select('id')
    .single<{ id: string }>()

  if (unitErr || !unit) {
    logFailure('create.units', unitErr, { orgId, propertyId })
    await undoProperty()
    return { ok: false, error: 'Couldn’t add the property: its unit record could not be created. Nothing was saved.' }
  }
  const unitId = asUnitId(unit.id)
  const undoUnit = () =>
    compensate('create.units', { orgId, unitId }, () =>
      db.from('units').delete().eq('id', unitId).eq('organization_id', orgId),
    )

  let ownershipId: string | null = null
  if (hasOwner(input.owner)) {
    const { data: own, error: ownErr } = await db
      .from('ownerships')
      .insert({
        organization_id: orgId,
        unit_id: unitId,
        owner_name: input.owner.name,
        owner_email: input.owner.email,
        owner_phone: input.owner.phone,
        ownership_pct: 100,
        valid_from: input.today,
        source: 'manual',
        created_by: input.userId,
      })
      .select('id')
      .single<{ id: string }>()

    if (ownErr || !own) {
      logFailure('create.ownerships', ownErr, { orgId, unitId })
      await undoUnit()
      await undoProperty()
      return { ok: false, error: 'Couldn’t add the property: its owner record could not be created. Nothing was saved.' }
    }
    ownershipId = own.id
  }

  return { ok: true, data: { propertyId, unitId, ownershipId } }
}

// ─── Update ─────────────────────────────────────────────────────────

export interface LotPatch {
  address?: string
  unitNumber?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  ownerPhone?: string | null
  notes?: string | null
}

interface PropertyRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
}

interface OwnershipRow {
  id: string
  owner_user_id: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  valid_from: string
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * Which current ownership "the owner" on the property page means: the one
 * whose email (then name) matches the property's previous owner fields,
 * else the earliest. Rows arrive ordered by valid_from, id. Pure.
 */
export function pickPrimaryOwnership(rows: readonly OwnershipRow[], prev: OwnerFields): OwnershipRow | null {
  if (rows.length === 0) return null
  if (prev.email) {
    const m = rows.find((r) => lower(r.owner_email) === lower(prev.email))
    if (m) return m
  }
  if (prev.name) {
    const m = rows.find((r) => lower(r.owner_name) === lower(prev.name))
    if (m) return m
  }
  return rows[0]
}

export interface UpdateLotInput {
  orgId: string
  propertyId: PropertyId
  patch: LotPatch
  today: string
  userId: string | null
}

export interface UpdatedLot {
  /** Whether a unit was found to mirror onto. */
  mirrored: boolean
  ownership: 'unchanged' | 'updated' | 'replaced' | 'opened' | 'closed'
}

/**
 * Edit a lot. The property row is the form's source; the canonical unit
 * gets the same address / unit number, and owner edits land on the
 * current ownership:
 *
 *   - owner fields filled, a current ownership exists → corrected in place
 *     (a contact fix is not a sale; "record a sale" is PR-03), EXCEPT when
 *     that ownership is linked to a portal account and the email changed:
 *     that is a different person, so it is closed and a new one opened;
 *   - owner fields filled, none exists → one is opened from today;
 *   - owner fields cleared → the current ownership is closed today.
 */
export async function updateLot(db: Db, input: UpdateLotInput): Promise<LotResult<UpdatedLot>> {
  const { orgId, propertyId, patch } = input

  const { data: current, error: readErr } = await db
    .from('hoa_properties')
    .select('id, address, unit_number, owner_name, owner_email, owner_phone, notes')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle<PropertyRow>()

  if (readErr) {
    logFailure('update.read', readErr, { orgId, propertyId })
    return { ok: false, error: 'Couldn’t load the property. Try again.' }
  }
  if (!current) return { ok: false, error: 'Property not found.' }

  const propPatch: Partial<PropertyRow> = {}
  if (patch.address !== undefined) propPatch.address = patch.address
  if (patch.unitNumber !== undefined) propPatch.unit_number = patch.unitNumber || null
  if (patch.ownerName !== undefined) propPatch.owner_name = patch.ownerName || null
  if (patch.ownerEmail !== undefined) propPatch.owner_email = patch.ownerEmail || null
  if (patch.ownerPhone !== undefined) propPatch.owner_phone = patch.ownerPhone || null
  if (patch.notes !== undefined) propPatch.notes = patch.notes || null
  if (Object.keys(propPatch).length === 0) return { ok: true, data: { mirrored: false, ownership: 'unchanged' } }

  const { error: updErr } = await db.from('hoa_properties').update(propPatch).eq('id', propertyId).eq('org_id', orgId)
  if (updErr) {
    logFailure('update.hoa_properties', updErr, { orgId, propertyId })
    return { ok: false, error: 'Couldn’t save the property. Try again.' }
  }

  const revertProperty = () => {
    const back: Partial<PropertyRow> = {}
    for (const k of Object.keys(propPatch) as Array<keyof PropertyRow>) {
      ;(back as Record<string, unknown>)[k] = current[k]
    }
    return compensate('update.hoa_properties', { orgId, propertyId }, () =>
      db.from('hoa_properties').update(back).eq('id', propertyId).eq('org_id', orgId),
    )
  }
  const fail = async (step: string, error: unknown, undo: Array<() => Promise<void>>) => {
    logFailure(step, error, { orgId, propertyId })
    for (const u of undo) await u()
    return {
      ok: false as const,
      error: 'Couldn’t save: the change could not be applied to the dues and mail records. Nothing was changed.',
    }
  }

  let resolution
  try {
    resolution = await resolveUnitForProperty(db, orgId, propertyId)
  } catch (err) {
    return fail('update.resolve', err, [revertProperty])
  }
  const unitId = resolution.unitId
  if (!unitId) return { ok: true, data: { mirrored: false, ownership: 'unchanged' } }

  // ── unit mirror ──
  const unitPatch: { address_line1?: string; unit_number?: string | null } = {}
  if (propPatch.address !== undefined && propPatch.address !== current.address) unitPatch.address_line1 = propPatch.address
  if (propPatch.unit_number !== undefined && propPatch.unit_number !== current.unit_number) {
    unitPatch.unit_number = propPatch.unit_number
  }
  const undo: Array<() => Promise<void>> = [revertProperty]
  if (Object.keys(unitPatch).length > 0) {
    const { data: unitBefore, error: ubErr } = await db
      .from('units')
      .select('address_line1, unit_number')
      .eq('id', unitId)
      .eq('organization_id', orgId)
      .maybeSingle<{ address_line1: string; unit_number: string | null }>()
    if (ubErr || !unitBefore) return fail('update.units.read', ubErr, undo)

    const { error: uErr } = await db.from('units').update(unitPatch).eq('id', unitId).eq('organization_id', orgId)
    if (uErr) return fail('update.units', uErr, undo)
    undo.unshift(() =>
      compensate('update.units', { orgId, unitId }, () =>
        db
          .from('units')
          .update({ address_line1: unitBefore.address_line1, unit_number: unitBefore.unit_number })
          .eq('id', unitId)
          .eq('organization_id', orgId),
      ),
    )
  }

  // ── ownership mirror ──
  const ownerTouched = patch.ownerName !== undefined || patch.ownerEmail !== undefined || patch.ownerPhone !== undefined
  if (!ownerTouched) return { ok: true, data: { mirrored: true, ownership: 'unchanged' } }

  const prevOwner: OwnerFields = { name: current.owner_name, email: current.owner_email, phone: current.owner_phone }
  const next: OwnerFields = {
    name: propPatch.owner_name !== undefined ? propPatch.owner_name : current.owner_name,
    email: propPatch.owner_email !== undefined ? propPatch.owner_email : current.owner_email,
    phone: propPatch.owner_phone !== undefined ? propPatch.owner_phone : current.owner_phone,
  }

  const { data: owns, error: oErr } = await db
    .from('ownerships')
    .select('id, owner_user_id, owner_name, owner_email, owner_phone, valid_from')
    .eq('organization_id', orgId)
    .eq('unit_id', unitId)
    .is('valid_to', null)
    .order('valid_from', { ascending: true })
    .order('id', { ascending: true })
  if (oErr) return fail('update.ownerships.read', oErr, undo)

  const target = pickPrimaryOwnership((owns ?? []) as OwnershipRow[], prevOwner)

  const openOwnership = () =>
    db
      .from('ownerships')
      .insert({
        organization_id: orgId,
        unit_id: unitId,
        owner_name: next.name,
        owner_email: next.email,
        owner_phone: next.phone,
        ownership_pct: 100,
        valid_from: input.today,
        source: 'manual',
        created_by: input.userId,
      })
      .select('id')
      .single<{ id: string }>()
  const closeOwnership = (row: OwnershipRow) =>
    db
      .from('ownerships')
      .update({ valid_to: laterOf(input.today, row.valid_from) })
      .eq('id', row.id)
      .eq('organization_id', orgId)
      .is('valid_to', null)
  const reopen = (row: OwnershipRow) => () =>
    compensate('update.ownerships.close', { orgId, ownershipId: row.id }, () =>
      db.from('ownerships').update({ valid_to: null }).eq('id', row.id).eq('organization_id', orgId),
    )

  if (!hasOwner(next)) {
    if (!target) return { ok: true, data: { mirrored: true, ownership: 'unchanged' } }
    const { error } = await closeOwnership(target)
    if (error) return fail('update.ownerships.close', error, undo)
    return { ok: true, data: { mirrored: true, ownership: 'closed' } }
  }

  if (!target) {
    const { error } = await openOwnership()
    if (error) return fail('update.ownerships.open', error, undo)
    return { ok: true, data: { mirrored: true, ownership: 'opened' } }
  }

  const sameIdentity = !target.owner_user_id || lower(target.owner_email) === lower(next.email)
  if (sameIdentity) {
    const { error } = await db
      .from('ownerships')
      .update({ owner_name: next.name, owner_email: next.email, owner_phone: next.phone })
      .eq('id', target.id)
      .eq('organization_id', orgId)
    if (error) return fail('update.ownerships.update', error, undo)
    return { ok: true, data: { mirrored: true, ownership: 'updated' } }
  }

  const { error: closeErr } = await closeOwnership(target)
  if (closeErr) return fail('update.ownerships.close', closeErr, undo)
  undo.unshift(reopen(target))
  const { error: openErr } = await openOwnership()
  if (openErr) return fail('update.ownerships.open', openErr, undo)
  return { ok: true, data: { mirrored: true, ownership: 'replaced' } }
}

// ─── Delete ─────────────────────────────────────────────────────────

export interface DeletedLot {
  closedOwnerships: number
  endedTenancies: number
}

/**
 * Soft-delete a lot. `units` has no `deleted_at` (that needs a migration,
 * phase M1), so the code-only way to take the lot out of audiences and
 * dues reminders is to close its current ownerships and end its active
 * tenancies — every audience and the dues-reminder job read only current
 * rows. Dues generation skips units whose property is deleted
 * (listBillableUnits below).
 */
export async function deleteLot(
  db: Db,
  input: { orgId: string; propertyId: PropertyId; today: string },
): Promise<LotResult<DeletedLot>> {
  const { orgId, propertyId, today } = input

  const { data: deleted, error: delErr } = await db
    .from('hoa_properties')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('id')
  if (delErr) {
    logFailure('delete.hoa_properties', delErr, { orgId, propertyId })
    return { ok: false, error: 'Couldn’t delete the property. Try again.' }
  }
  if (!deleted || deleted.length === 0) return { ok: false, error: 'Property not found.' }

  const restoreProperty = () =>
    compensate('delete.hoa_properties', { orgId, propertyId }, () =>
      db.from('hoa_properties').update({ deleted_at: null }).eq('id', propertyId).eq('org_id', orgId),
    )
  const fail = async (step: string, error: unknown, undo: Array<() => Promise<void>>) => {
    logFailure(step, error, { orgId, propertyId })
    for (const u of undo) await u()
    return { ok: false as const, error: 'Couldn’t delete the property. Nothing was changed.' }
  }

  let unitIds: UnitId[]
  try {
    unitIds = (await resolveUnitForProperty(db, orgId, propertyId)).unitIds
  } catch (err) {
    return fail('delete.resolve', err, [restoreProperty])
  }
  if (unitIds.length === 0) return { ok: true, data: { closedOwnerships: 0, endedTenancies: 0 } }

  const undo: Array<() => Promise<void>> = [restoreProperty]

  const { data: owns, error: oErr } = await db
    .from('ownerships')
    .select('id, valid_from')
    .eq('organization_id', orgId)
    .in('unit_id', unitIds)
    .is('valid_to', null)
  if (oErr) return fail('delete.ownerships.read', oErr, undo)

  const closed: string[] = []
  for (const o of (owns ?? []) as Array<{ id: string; valid_from: string }>) {
    const { error } = await db
      .from('ownerships')
      .update({ valid_to: laterOf(today, o.valid_from) })
      .eq('id', o.id)
      .eq('organization_id', orgId)
      .is('valid_to', null)
    if (error) {
      return fail('delete.ownerships.close', error, [
        () =>
          closed.length === 0
            ? Promise.resolve()
            : compensate('delete.ownerships.close', { orgId, count: closed.length }, () =>
                db.from('ownerships').update({ valid_to: null }).in('id', closed).eq('organization_id', orgId),
              ),
        ...undo,
      ])
    }
    closed.push(o.id)
  }
  if (closed.length > 0) {
    undo.unshift(() =>
      compensate('delete.ownerships.close', { orgId, count: closed.length }, () =>
        db.from('ownerships').update({ valid_to: null }).in('id', closed).eq('organization_id', orgId),
      ),
    )
  }

  const { data: ended, error: tErr } = await db
    .from('tenancies')
    .update({ status: 'ended' })
    .eq('organization_id', orgId)
    .in('unit_id', unitIds)
    .eq('status', 'active')
    .select('id')
  if (tErr) return fail('delete.tenancies', tErr, undo)

  return { ok: true, data: { closedOwnerships: closed.length, endedTenancies: (ended ?? []).length } }
}

// ─── Add an owner (Residents card) ──────────────────────────────────

/**
 * Give a lot's canonical unit a current ownership for `owner`, unless one
 * for the same person (email, else name) is already current. No unit →
 * 'no_unit' (the caller says so; there is nothing to attach to).
 */
export async function addOwnershipForProperty(
  db: Db,
  input: { orgId: string; propertyId: PropertyId; owner: OwnerFields; today: string; userId: string | null },
): Promise<LotResult<{ outcome: 'created' | 'existing' | 'no_unit'; ownershipId: string | null }>> {
  const { orgId, propertyId, owner } = input
  let unitId: UnitId | null
  try {
    unitId = (await resolveUnitForProperty(db, orgId, propertyId)).unitId
  } catch (err) {
    logFailure('owner.resolve', err, { orgId, propertyId })
    return { ok: false, error: 'Couldn’t link the owner to the property’s dues and mail records.' }
  }
  if (!unitId) return { ok: true, data: { outcome: 'no_unit', ownershipId: null } }

  const { data: owns, error: oErr } = await db
    .from('ownerships')
    .select('id, owner_name, owner_email')
    .eq('organization_id', orgId)
    .eq('unit_id', unitId)
    .is('valid_to', null)
  if (oErr) {
    logFailure('owner.read', oErr, { orgId, unitId })
    return { ok: false, error: 'Couldn’t link the owner to the property’s dues and mail records.' }
  }
  const match = ((owns ?? []) as Array<{ id: string; owner_name: string | null; owner_email: string | null }>).find(
    (o) => (owner.email ? lower(o.owner_email) === lower(owner.email) : lower(o.owner_name) === lower(owner.name)),
  )
  if (match) return { ok: true, data: { outcome: 'existing', ownershipId: match.id } }

  const { data: own, error } = await db
    .from('ownerships')
    .insert({
      organization_id: orgId,
      unit_id: unitId,
      owner_name: owner.name,
      owner_email: owner.email,
      owner_phone: owner.phone,
      ownership_pct: 100,
      valid_from: input.today,
      source: 'manual',
      created_by: input.userId,
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !own) {
    logFailure('owner.insert', error, { orgId, unitId })
    return { ok: false, error: 'Couldn’t link the owner to the property’s dues and mail records.' }
  }
  return { ok: true, data: { outcome: 'created', ownershipId: own.id } }
}

// ─── Dues: which units can be billed ────────────────────────────────

const PAGE = 1000

/**
 * Units of an association that dues may bill: every unit EXCEPT those
 * whose bridged property is soft-deleted (units has no deleted_at of its
 * own). Paged past PostgREST's 1000-row cap. Throws on a failed read.
 */
export async function listBillableUnits(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<Array<{ id: UnitId; unit_number: string | null }>> {
  const rows: Array<{ id: string; unit_number: string | null; legacy_hoa_property_id: string | null }> = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('units')
      .select('id, unit_number, legacy_hoa_property_id')
      .eq('organization_id', orgId)
      .eq('association_id', associationId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      logFailure('billable.units', error, { orgId, associationId })
      throw error
    }
    rows.push(...((data ?? []) as typeof rows))
    if (!data || data.length < PAGE) break
  }

  const bridged = [...new Set(rows.map((r) => r.legacy_hoa_property_id).filter((x): x is string => !!x))]
  const deleted = new Set<string>()
  for (let i = 0; i < bridged.length; i += 150) {
    const { data, error } = await db
      .from('hoa_properties')
      .select('id')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null)
      .in('id', bridged.slice(i, i + 150))
    if (error) {
      logFailure('billable.deleted', error, { orgId })
      throw error
    }
    for (const r of (data ?? []) as Array<{ id: string }>) deleted.add(r.id)
  }

  return rows
    .filter((r) => !r.legacy_hoa_property_id || !deleted.has(r.legacy_hoa_property_id))
    .map((r) => ({ id: asUnitId(r.id), unit_number: r.unit_number }))
}

/**
 * Give every live property that has no unit a unit in `associationId`
 * (the "Add units before generating assessments" dead end: properties
 * added before createLot wrote both sides). Call only when the org has
 * exactly one association, so the placement is not a guess.
 */
export async function ensureUnitsForProperties(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<LotResult<{ created: number }>> {
  const props: Array<{ id: string; address: string; unit_number: string | null }> = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('hoa_properties')
      .select('id, address, unit_number')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      logFailure('ensure.hoa_properties', error, { orgId })
      return { ok: false, error: 'Couldn’t check which properties are ready for dues.' }
    }
    props.push(...((data ?? []) as typeof props))
    if (!data || data.length < PAGE) break
  }
  if (props.length === 0) return { ok: true, data: { created: 0 } }

  let linked: Map<PropertyId, UnitId>
  try {
    linked = await unitIdsForProperties(db, orgId, props.map((p) => p.id))
  } catch {
    return { ok: false, error: 'Couldn’t check which properties are ready for dues.' }
  }
  const missing = props.filter((p) => !linked.has(asPropertyId(p.id)))
  let created = 0
  for (let i = 0; i < missing.length; i += 200) {
    const batch = missing.slice(i, i + 200)
    const { error } = await db.from('units').insert(
      batch.map((p) => ({
        organization_id: orgId,
        association_id: associationId,
        address_line1: p.address,
        unit_number: p.unit_number,
        legacy_hoa_property_id: p.id,
      })),
    )
    if (error) {
      logFailure('ensure.units', error, { orgId, count: batch.length })
      return { ok: false, error: 'Couldn’t prepare every property for dues. Try again.' }
    }
    created += batch.length
  }
  return { ok: true, data: { created } }
}

/**
 * The subset of `unitIds` whose bridged property is soft-deleted — the
 * code-only stand-in for `units.deleted_at` (which needs a migration).
 * Only POSITIVELY deleted lots are returned: an unbridged unit, or one
 * whose rows did not come back, is kept, so a reader that filters with
 * this can only ever drop a deleted lot. Throws on a failed read.
 */
export async function unitIdsOfDeletedProperties(db: Db, unitIds: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const ids = [...new Set(unitIds)]
  for (let i = 0; i < ids.length; i += 150) {
    const { data: units, error } = await db
      .from('units')
      .select('id, legacy_hoa_property_id')
      .in('id', ids.slice(i, i + 150))
      .not('legacy_hoa_property_id', 'is', null)
    if (error) throw error
    const rows = (units ?? []) as Array<{ id: string; legacy_hoa_property_id: string }>
    if (rows.length === 0) continue
    const { data: gone, error: goneErr } = await db
      .from('hoa_properties')
      .select('id')
      .in('id', [...new Set(rows.map((r) => r.legacy_hoa_property_id))])
      .not('deleted_at', 'is', null)
    if (goneErr) throw goneErr
    const deleted = new Set(((gone ?? []) as Array<{ id: string }>).map((g) => g.id))
    for (const r of rows) if (deleted.has(r.legacy_hoa_property_id)) out.add(r.id)
  }
  return out
}
