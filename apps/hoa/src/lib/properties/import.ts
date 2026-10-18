/**
 * Rows → whole lots: the ONE import engine (C0.4, P4).
 *
 * Two callers, one engine:
 *   - the platform-admin Properties.csv + Residents.csv import
 *     (runUnitsImport → /admin/import-units, service-role client), and
 *   - the board's own roster import (lib/properties/roster/commit.ts →
 *     /properties/import, the board user's RLS client).
 *
 * The import used to write only `units` / `ownerships` / `tenancies`, so
 * imported lots were invisible on /properties until someone ran two
 * hand-edited SQL files hardcoded to the pilot org
 * (migrations/mirror-units-to-hoa-properties.sql and
 * backfill-owners-as-residents.sql, now deleted). It now writes both
 * sides itself:
 *
 *   property row → hoa_properties (matched by normalized address + unit,
 *                  lib/properties/match-home.ts, else created) + units
 *                  (bridged via legacy_hoa_property_id)
 *   owner row    → ownerships + a property_residents owner row, and the
 *                  property's inline owner_* when it has none yet
 *   tenant row   → tenancies
 *
 * What happens to a home that already exists is the caller's choice
 * (`onExisting`): 'reuse' (the admin default: link it, add what is
 * missing), 'skip' (leave it alone entirely) or 'update' (also correct
 * its unit / city / state / ZIP, fill an unknown tenure, and refresh the
 * phone and name of an owner already on file by email).
 *
 * Re-runnable: every step reuses what it finds. Re-running it over a CSV
 * imported before this change links the existing units to their existing
 * properties instead of duplicating them.
 *
 * Client-agnostic: every read and write is scoped to `orgId` explicitly,
 * so it is correct under the service-role client and under RLS alike.
 * The caller gates first. Logs carry ids and codes only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { buildHomeIndex, matchHome, pickUnitAtAddress, type HomeIndex } from './match-home'

type Db = SupabaseClient<Database>

interface Counter {
  inserted: number
  reused: number
  errored: number
}

export type ExistingHomeMode = 'reuse' | 'skip' | 'update'
export type ImportTenure = 'owner_occupied' | 'leased' | 'unknown'

/** What happened to one input row (property or resident), for row-level reports. */
export interface RowOutcome {
  status: 'created' | 'reused' | 'updated' | 'skipped' | 'error'
  /** User-facing, never database text. */
  reason?: string
  propertyId?: string | null
}

export interface ImportResult {
  ok: boolean
  error?: string
  dryRun: boolean
  properties: Counter
  units: Counter
  ownerships: Counter
  residents: Counter
  tenancies: Counter
  /** Resident rows skipped (no lot, no key, unknown type). */
  skipped: number
  /** Existing homes left untouched because onExisting was 'skip'. */
  skippedHomes: number
  warnings: string[] // capped at 30 so the UI doesn't explode
  /** Per input row, keyed by its id. Uncapped. */
  outcomes: { properties: Record<string, RowOutcome>; residents: Record<string, RowOutcome> }
}

export interface ImportInput {
  orgId: string
  associationId: string | null
  propertiesCsv: string
  residentsCsv: string
  apply: boolean
}

interface PropertyCsvRow {
  id: string
  address: string
  lot_number: string
  street: string
  unit: string
  zip: string
  city: string
  state: string
  status: string
  notes: string
  address_line1: string
  address_line2: string
  country: string
  property_type: string
  occupancy_type: string
  tenant_id: string
}

interface ResidentCsvRow {
  id: string
  property_id: string
  profile_id: string
  full_name: string
  email: string
  phone: string
  type: string
  move_in_date: string
  move_out_date: string
  is_current: string
  first_name: string
  last_name: string
  created_at: string
}

/** One property row. Only `id` is required; the CSV columns are all optional. */
export type LotPropertyRow = Partial<PropertyCsvRow> & {
  id: string
  tenure?: ImportTenure | null
  mailing_address?: string | null
}

/** One resident row, pointing at a property row's `id`. */
export type LotResidentRow = Partial<ResidentCsvRow> & { id: string; property_id: string }

export interface LotsInput {
  orgId: string
  associationId: string | null
  properties: readonly LotPropertyRow[]
  residents: readonly LotResidentRow[]
  apply: boolean
  /** Default 'reuse'. */
  onExisting?: ExistingHomeMode
  /**
   * An address shared by several homes, with no unit to tell them apart.
   * 'unlinked' (default, the admin behaviour) carries on without linking a
   * property; 'error' refuses the row.
   */
  onAmbiguous?: 'unlinked' | 'error'
}

export const AMBIGUOUS_HOME_REASON = 'Several homes share this address. Add the unit number to tell them apart.'

const counter = (): Counter => ({ inserted: 0, reused: 0, errored: 0 })

/** Ids and codes only, never names or addresses. */
function logFailure(step: string, error: unknown, ids: Record<string, string | null>): void {
  console.error(`[properties.import] ${step} failed`, { ...ids, code: (error as { code?: string } | null)?.code ?? null })
}

/** A lot this run knows about: its unit and (once resolved) its property. */
interface LotRef {
  unitId: string
  propertyId: string | null
}

function emptyResult(apply: boolean): ImportResult {
  return {
    ok: true,
    dryRun: !apply,
    properties: counter(),
    units: counter(),
    ownerships: counter(),
    residents: counter(),
    tenancies: counter(),
    skipped: 0,
    skippedHomes: 0,
    warnings: [],
    outcomes: { properties: {}, residents: {} },
  }
}

/**
 * Live properties by normalized address + unit: how an imported row finds
 * the property it already has (same address rule as the 0028 bridge
 * backfill). An address shared by several live properties with no unit to
 * choose by is ambiguous and is not linked. Null when the read failed.
 */
export async function loadHomeIndex(db: Db, orgId: string): Promise<HomeIndex | null> {
  const homes: Array<{ id: string; address: string; unit_number: string | null }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('hoa_properties')
      .select('id, address, unit_number')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) {
      logFailure('read.hoa_properties', error, { orgId })
      return null
    }
    homes.push(...((data ?? []) as typeof homes))
    if (!data || data.length < 1000) break
  }
  return buildHomeIndex(homes)
}

/** Platform-admin entry point: two CSV texts. */
export async function runUnitsImport(db: Db, input: ImportInput): Promise<ImportResult> {
  let properties: PropertyCsvRow[]
  let residents: ResidentCsvRow[]
  try {
    properties = parseCsv<PropertyCsvRow>(input.propertiesCsv)
    residents = parseCsv<ResidentCsvRow>(input.residentsCsv)
  } catch (err) {
    return { ...emptyResult(input.apply), ok: false, error: `CSV parse failed: ${(err as Error).message}` }
  }
  return importLots(db, {
    orgId: input.orgId,
    associationId: input.associationId,
    properties,
    residents,
    apply: input.apply,
  })
}

export async function importLots(db: Db, input: LotsInput): Promise<ImportResult> {
  const { orgId } = input
  const onExisting: ExistingHomeMode = input.onExisting ?? 'reuse'
  const result = emptyResult(input.apply)
  const outcome = result.outcomes

  // The association must be this org's: the service-role client would
  // otherwise happily file one tenant's units under another's community.
  if (input.associationId) {
    const { data: assoc, error } = await db
      .from('associations')
      .select('id')
      .eq('id', input.associationId)
      .eq('organization_id', orgId)
      .maybeSingle<{ id: string }>()
    if (error) return { ...result, ok: false, error: 'Couldn’t check the community. Nothing was written.' }
    if (!assoc) return { ...result, ok: false, error: 'That community does not belong to this tenant. Nothing was written.' }
  }

  const index = await loadHomeIndex(db, orgId)
  if (!index) return { ...result, ok: false, error: 'Couldn’t read existing properties. Nothing was written.' }

  const insertProperty = async (p: LotPropertyRow, addressLine1: string): Promise<string | null> => {
    const { data, error } = await db
      .from('hoa_properties')
      .insert({
        org_id: orgId,
        address: addressLine1,
        unit_number: nz(p.unit),
        notes: buildUnitNotes(p),
        ...(p.tenure ? { tenure: p.tenure } : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (error || !data) {
      logFailure('insert.hoa_properties', error, { orgId })
      return null
    }
    index.remember(data.id, addressLine1, nz(p.unit))
    return data.id
  }

  type UnitRow = { id: string; legacy_hoa_property_id: string | null; unit_number: string | null }
  /** The unit bridged to the matched property, else the one at this address. */
  const findExistingUnit = async (
    addressLine1: string,
    unit: string | null,
    propertyId: string | null,
  ): Promise<{ ok: true; unit: UnitRow | null } | { ok: false }> => {
    if (propertyId && !propertyId.startsWith('dry:')) {
      const { data, error } = await db
        .from('units')
        .select('id, legacy_hoa_property_id, unit_number, created_at')
        .eq('organization_id', orgId)
        .eq('legacy_hoa_property_id', propertyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
      if (error) {
        logFailure('read.units', error, { orgId })
        return { ok: false }
      }
      const bridged = ((data ?? []) as UnitRow[])[0]
      if (bridged) return { ok: true, unit: bridged }
    }
    const { data, error } = await db
      .from('units')
      .select('id, legacy_hoa_property_id, unit_number, created_at')
      .eq('organization_id', orgId)
      .eq('address_line1', addressLine1)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(20)
    if (error) {
      logFailure('read.units', error, { orgId })
      return { ok: false }
    }
    return { ok: true, unit: pickUnitAtAddress((data ?? []) as UnitRow[], unit) }
  }

  /** 'update' mode: correct the unit's address details; fill an unknown tenure. */
  const updateExisting = async (unitId: string, propertyId: string | null, p: LotPropertyRow): Promise<boolean> => {
    const unitPatch = definedOnly({
      unit_number: nz(p.unit),
      lot_number: nz(p.lot_number),
      address_line2: nz(p.address_line2),
      city: nz(p.city),
      state: nz(p.state),
      postal_code: nz(p.zip),
    })
    if (Object.keys(unitPatch).length > 0) {
      const { error } = await db.from('units').update(unitPatch).eq('id', unitId).eq('organization_id', orgId)
      if (error) {
        logFailure('update.units', error, { orgId, unitId })
        return false
      }
    }
    if (!propertyId) return true
    const unitNumber = nz(p.unit)
    if (unitNumber) {
      const { error } = await db
        .from('hoa_properties')
        .update({ unit_number: unitNumber })
        .eq('id', propertyId)
        .eq('org_id', orgId)
      if (error) {
        logFailure('update.hoa_properties', error, { orgId, propertyId })
        return false
      }
    }
    if (p.tenure && p.tenure !== 'unknown') {
      // Fills an unknown tenure only; a tenure the board set stays (and
      // changing one belongs to setPropertyTenure, which logs the event).
      const { error } = await db
        .from('hoa_properties')
        .update({ tenure: p.tenure, tenure_updated_at: new Date().toISOString() })
        .eq('id', propertyId)
        .eq('org_id', orgId)
        .eq('tenure', 'unknown')
      if (error) {
        logFailure('update.hoa_properties.tenure', error, { orgId, propertyId })
        return false
      }
    }
    return true
  }

  const lots = new Map<string, LotRef>() // property row id → lot
  const skippedHomes = new Set<string>() // property row ids left alone ('skip')

  // ─── 1. properties → hoa_properties + units ─────────────────────
  for (const p of input.properties) {
    const addressLine1 = nz(p.address_line1) ?? nz(p.address) ?? ''
    const unit = nz(p.unit)
    if (!addressLine1) {
      pushWarn(result, `skip property ${p.id}: no address`)
      result.units.errored += 1
      outcome.properties[p.id] = { status: 'error', reason: 'The address is missing.' }
      continue
    }

    const match = matchHome(index, addressLine1, unit)
    if (match.kind === 'ambiguous') {
      if (input.onAmbiguous === 'error') {
        result.properties.errored += 1
        outcome.properties[p.id] = { status: 'error', reason: AMBIGUOUS_HOME_REASON }
        continue
      }
      pushWarn(result, `property ${p.id}: several existing properties share this address; not linked`)
    }
    const matchedId = match.kind === 'match' ? match.propertyId : null

    const found = await findExistingUnit(addressLine1, unit, matchedId)
    if (!found.ok) {
      pushWarn(result, `property ${p.id}: could not check for an existing unit`)
      result.units.errored += 1
      outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t check whether this home exists. Nothing was saved for it.' }
      continue
    }
    const existing = found.unit

    if (onExisting === 'skip' && (existing || matchedId)) {
      result.skippedHomes += 1
      skippedHomes.add(p.id)
      outcome.properties[p.id] = {
        status: 'skipped',
        reason: 'Already on file.',
        propertyId: matchedId ?? existing?.legacy_hoa_property_id ?? null,
      }
      continue
    }

    // A home that exists, reused (and in 'update' mode corrected).
    const reuse = async (unitId: string, propertyId: string | null): Promise<void> => {
      lots.set(p.id, { unitId, propertyId })
      if (onExisting !== 'update') {
        outcome.properties[p.id] = { status: 'reused', propertyId }
        return
      }
      if (input.apply && !(await updateExisting(unitId, propertyId, p))) {
        pushWarn(result, `property ${p.id}: could not be updated`)
        outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t update this home. Try again.', propertyId }
        return
      }
      outcome.properties[p.id] = { status: 'updated', propertyId }
    }

    if (existing) {
      result.units.reused += 1
      if (existing.legacy_hoa_property_id) {
        result.properties.reused += 1
        await reuse(existing.id, existing.legacy_hoa_property_id)
        continue
      }
      // An earlier import's unit with no property: link it now.
      if (!input.apply) {
        if (matchedId) result.properties.reused += 1
        else if (match.kind !== 'ambiguous') result.properties.inserted += 1
        await reuse(existing.id, matchedId ?? (match.kind === 'ambiguous' ? null : `dry:${p.id}`))
        continue
      }
      if (match.kind === 'ambiguous') {
        await reuse(existing.id, null)
        continue
      }
      let propertyId = matchedId
      const created = !propertyId
      if (!propertyId) propertyId = await insertProperty(p, addressLine1)
      if (!propertyId) {
        pushWarn(result, `property ${p.id}: could not create its property record`)
        result.properties.errored += 1
        lots.set(p.id, { unitId: existing.id, propertyId: null })
        outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t save this home. Try again.' }
        continue
      }
      const { error: linkErr } = await db
        .from('units')
        .update({ legacy_hoa_property_id: propertyId })
        .eq('id', existing.id)
        .eq('organization_id', orgId)
      if (linkErr) {
        logFailure('link.units', linkErr, { orgId, unitId: existing.id })
        if (created) {
          await db.from('hoa_properties').delete().eq('id', propertyId).eq('org_id', orgId)
          index.forget(propertyId)
        }
        pushWarn(result, `property ${p.id}: could not link its unit`)
        result.properties.errored += 1
        lots.set(p.id, { unitId: existing.id, propertyId: null })
        outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t save this home. Try again.' }
        continue
      }
      result.properties[created ? 'inserted' : 'reused'] += 1
      await reuse(existing.id, propertyId)
      continue
    }

    if (!input.apply) {
      // Dry run: the source id stands in so resident lookups still count.
      result.units.inserted += 1
      if (matchedId) result.properties.reused += 1
      else if (match.kind !== 'ambiguous') result.properties.inserted += 1
      const propertyId = matchedId ?? (match.kind === 'ambiguous' ? null : `dry:${p.id}`)
      if (matchedId) await reuse(`dry:${p.id}`, propertyId)
      else {
        lots.set(p.id, { unitId: `dry:${p.id}`, propertyId })
        outcome.properties[p.id] = { status: 'created', propertyId }
      }
      continue
    }

    // New lot: the property first (or the one already there), then the
    // unit carrying the bridge. A failed unit insert removes a property
    // this run created, so no half lot is left.
    let propertyId: string | null = matchedId
    const created = !propertyId && match.kind !== 'ambiguous'
    if (created) {
      propertyId = await insertProperty(p, addressLine1)
      if (!propertyId) {
        pushWarn(result, `property ${p.id}: could not create its property record`)
        result.properties.errored += 1
        result.units.errored += 1
        outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t save this home. Try again.' }
        continue
      }
    }

    const { data: inserted, error } = await db
      .from('units')
      .insert({
        organization_id: orgId,
        association_id: input.associationId,
        address_line1: addressLine1,
        address_line2: nz(p.address_line2),
        city: nz(p.city),
        state: nz(p.state),
        postal_code: nz(p.zip),
        unit_number: unit,
        lot_number: nz(p.lot_number),
        notes: buildUnitNotes(p),
        legacy_hoa_property_id: propertyId,
      })
      .select('id')
      .single<{ id: string }>()

    if (error || !inserted) {
      logFailure('insert.units', error, { orgId })
      if (created && propertyId) {
        const { error: undoErr } = await db.from('hoa_properties').delete().eq('id', propertyId).eq('org_id', orgId)
        if (undoErr) logFailure('compensate.hoa_properties', undoErr, { orgId, propertyId })
        index.forget(propertyId)
      }
      pushWarn(result, `property ${p.id}: could not create its unit`)
      result.units.errored += 1
      if (created) result.properties.errored += 1
      outcome.properties[p.id] = { status: 'error', reason: 'Couldn’t save this home. Try again.' }
      continue
    }
    result.units.inserted += 1
    if (propertyId) result.properties[created ? 'inserted' : 'reused'] += 1
    if (created) {
      lots.set(p.id, { unitId: inserted.id, propertyId })
      outcome.properties[p.id] = { status: 'created', propertyId }
    } else {
      // The property was already there without a unit: it is an existing home.
      await reuse(inserted.id, propertyId)
    }
  }

  // ─── 2. residents → ownerships / property_residents / tenancies ──
  const primaryTaken = new Set<string>() // property ids that already have a primary owner resident
  for (const r of input.residents) {
    if (skippedHomes.has(r.property_id)) {
      outcome.residents[r.id] = { status: 'skipped', reason: 'The home is already on file.' }
      continue
    }
    const lot = lots.get(r.property_id)
    if (!lot) {
      pushWarn(result, `skip resident ${r.id}: no matching property (${r.property_id})`)
      result.skipped += 1
      outcome.residents[r.id] = { status: 'skipped', reason: 'The home wasn’t saved, so its owner wasn’t either.' }
      continue
    }
    const unitId = lot.unitId

    const primaryEmail = firstNonEmpty(splitMulti(nz(r.email)))
    const primaryPhone = firstNonEmpty(splitMulti(nz(r.phone)))
    const fullName =
      nz(r.full_name) ?? ([nz(r.first_name), nz(r.last_name)].filter(Boolean).join(' ').trim() || null)
    const isCurrent = (r.is_current ?? '').toLowerCase() === 'true'
    const kind = (nz(r.type) ?? 'owner').toLowerCase()

    if (kind === 'owner') {
      if (!primaryEmail && !fullName) {
        pushWarn(result, `skip resident ${r.id}: no email or name to key on`)
        result.skipped += 1
        outcome.residents[r.id] = { status: 'skipped', reason: 'No owner name or email.' }
        continue
      }

      // Lookup by (unit_id, lower(owner_email)) first, fall back to name.
      let existingOwnershipId: string | null = null
      if (!unitId.startsWith('dry:')) {
        const q = db.from('ownerships').select('id').eq('organization_id', orgId).eq('unit_id', unitId)
        const { data } = await (primaryEmail
          ? q.ilike('owner_email', escapeLike(primaryEmail))
          : q.ilike('owner_name', escapeLike(fullName ?? ''))
        ).limit(1)
        existingOwnershipId = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null
      }

      const validFrom = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const validTo = isCurrent ? null : parseDateOrFallback(r.move_out_date, null)
      let status: RowOutcome['status'] = 'created'

      if (existingOwnershipId) {
        result.ownerships.reused += 1
        status = 'reused'
        if (onExisting === 'update') {
          status = 'updated'
          const patch = definedOnly({ owner_name: fullName, owner_phone: primaryPhone })
          if (input.apply && Object.keys(patch).length > 0) {
            const { error } = await db
              .from('ownerships')
              .update(patch)
              .eq('id', existingOwnershipId)
              .eq('organization_id', orgId)
            if (error) {
              logFailure('update.ownerships', error, { orgId, unitId })
              pushWarn(result, `ownership for resident ${r.id}: could not be updated`)
              outcome.residents[r.id] = { status: 'error', reason: 'Couldn’t update the owner. Try again.' }
              continue
            }
          }
        }
      } else if (!input.apply) result.ownerships.inserted += 1
      else {
        const { error } = await db.from('ownerships').insert({
          organization_id: orgId,
          unit_id: unitId,
          owner_user_id: null,
          owner_name: fullName,
          owner_email: primaryEmail,
          owner_phone: primaryPhone,
          ownership_pct: 100,
          valid_from: validFrom,
          valid_to: validTo,
          source: 'csv_import',
        })
        if (error) {
          logFailure('insert.ownerships', error, { orgId, unitId })
          pushWarn(result, `ownership for resident ${r.id}: could not be created`)
          result.ownerships.errored += 1
          outcome.residents[r.id] = { status: 'error', reason: 'Couldn’t save the owner. Try again.' }
          continue
        }
        result.ownerships.inserted += 1
      }
      outcome.residents[r.id] = { status }

      // The /properties side: a current owner shows on the Residents card
      // and, when the property has none, as its inline owner.
      if (validTo !== null || !lot.propertyId) continue
      const ok = await writeOwnerResident(db, result, input.apply, orgId, lot.propertyId, primaryTaken, onExisting === 'update', {
        residentRef: r.id,
        fullName,
        email: primaryEmail,
        phone: primaryPhone,
        movedInAt: validFrom,
      })
      if (!ok) outcome.residents[r.id] = { status: 'error', reason: 'The owner was saved but couldn’t be added to the home’s residents.' }
    } else if (kind === 'tenant' || kind === 'renter') {
      const leaseStart = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const leaseEnd = parseDateOrFallback(r.move_out_date, null)
      const status = isCurrent && !leaseEnd ? 'active' : 'ended'

      let existingTenancy = false
      if (!unitId.startsWith('dry:')) {
        const { data } = await db
          .from('tenancies')
          .select('id')
          .eq('organization_id', orgId)
          .eq('unit_id', unitId)
          .eq('lease_start', leaseStart)
          .ilike('tenant_email', escapeLike(primaryEmail ?? ''))
          .limit(1)
        existingTenancy = (data ?? []).length > 0
      }
      if (existingTenancy) {
        result.tenancies.reused += 1
        outcome.residents[r.id] = { status: 'reused' }
        continue
      }
      if (!input.apply) {
        result.tenancies.inserted += 1
        outcome.residents[r.id] = { status: 'created' }
        continue
      }

      const { error } = await db.from('tenancies').insert({
        organization_id: orgId,
        unit_id: unitId,
        tenant_user_id: null,
        tenant_name: fullName,
        tenant_email: primaryEmail,
        tenant_phone: primaryPhone,
        lease_start: leaseStart,
        lease_end: leaseEnd,
        status,
      })
      if (error) {
        logFailure('insert.tenancies', error, { orgId, unitId })
        pushWarn(result, `tenancy for resident ${r.id}: could not be created`)
        result.tenancies.errored += 1
        outcome.residents[r.id] = { status: 'error', reason: 'Couldn’t save the tenant. Try again.' }
        continue
      }
      result.tenancies.inserted += 1
      outcome.residents[r.id] = { status: 'created' }
    } else {
      pushWarn(result, `skip resident ${r.id}: unknown type "${r.type}"`)
      result.skipped += 1
      outcome.residents[r.id] = { status: 'skipped', reason: 'Unknown resident type.' }
    }
  }

  return result
}

/**
 * The owner as a property_residents row (what the backfill script did),
 * skipped when the property already has a current resident with that
 * email (or name, when there is no email). The first owner of a property
 * with no primary owner yet is marked primary and becomes its inline
 * owner_* when those are empty. With `refresh` ('update' mode) a resident
 * already there gets the file's name and phone, and so does the inline
 * owner when it is the same email. False when a write failed.
 */
async function writeOwnerResident(
  db: Db,
  result: ImportResult,
  apply: boolean,
  orgId: string,
  propertyId: string,
  primaryTaken: Set<string>,
  refresh: boolean,
  owner: { residentRef: string; fullName: string | null; email: string | null; phone: string | null; movedInAt: string },
): Promise<boolean> {
  const dry = propertyId.startsWith('dry:')

  let current: Array<{ id: string; email: string | null; full_name: string; is_primary: boolean; role: string }> = []
  if (!dry) {
    const { data, error } = await db
      .from('property_residents')
      .select('id, email, full_name, is_primary, role')
      .eq('organization_id', orgId)
      .eq('property_id', propertyId)
      .is('moved_out_at', null)
      .is('deleted_at', null)
    if (error) {
      logFailure('read.property_residents', error, { orgId, propertyId })
      pushWarn(result, `resident ${owner.residentRef}: could not check the property's residents`)
      result.residents.errored += 1
      return false
    }
    current = (data ?? []) as typeof current
  }
  if (current.some((c) => c.role === 'owner' && c.is_primary)) primaryTaken.add(propertyId)

  const lower = (s: string | null) => (s ?? '').trim().toLowerCase()
  const already = current.find((c) =>
    owner.email ? lower(c.email) === lower(owner.email) : lower(c.full_name) === lower(owner.fullName),
  )
  if (already) {
    result.residents.reused += 1
    if (!refresh || !apply) return true
    const patch = definedOnly({ full_name: owner.fullName, phone: owner.phone })
    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from('property_residents')
        .update(patch)
        .eq('id', already.id)
        .eq('organization_id', orgId)
      if (error) {
        logFailure('update.property_residents', error, { orgId, propertyId })
        return false
      }
    }
    if (owner.email) {
      const inline = definedOnly({ owner_name: owner.fullName, owner_phone: owner.phone })
      if (Object.keys(inline).length > 0) {
        const { error } = await db
          .from('hoa_properties')
          .update(inline)
          .eq('id', propertyId)
          .eq('org_id', orgId)
          .ilike('owner_email', escapeLike(owner.email))
        if (error) logFailure('update.hoa_properties.owner', error, { orgId, propertyId })
      }
    }
    return true
  }
  const isPrimary = !primaryTaken.has(propertyId)
  primaryTaken.add(propertyId)
  if (!apply) {
    result.residents.inserted += 1
    return true
  }

  const { error } = await db.from('property_residents').insert({
    organization_id: orgId,
    property_id: propertyId,
    full_name: owner.fullName ?? owner.email?.split('@')[0] ?? 'Owner',
    email: owner.email,
    phone: owner.phone,
    role: 'owner',
    is_primary: isPrimary,
    moved_in_at: owner.movedInAt,
  })
  if (error) {
    logFailure('insert.property_residents', error, { orgId, propertyId })
    pushWarn(result, `resident ${owner.residentRef}: could not be added to the property`)
    result.residents.errored += 1
    return false
  }
  result.residents.inserted += 1

  if (isPrimary) {
    // Only fills an EMPTY inline owner; never overwrites what the board typed.
    const { error: ownerErr } = await db
      .from('hoa_properties')
      .update({ owner_name: owner.fullName, owner_email: owner.email, owner_phone: owner.phone })
      .eq('id', propertyId)
      .eq('org_id', orgId)
      .is('owner_name', null)
      .is('owner_email', null)
    if (ownerErr) logFailure('update.hoa_properties.owner', ownerErr, { orgId, propertyId })
  }
  return true
}

// ─── helpers ─────────────────────────────────────────────────────────

function pushWarn(result: ImportResult, msg: string): void {
  if (result.warnings.length < 30) result.warnings.push(msg)
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function nz(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  if (t === '' || t.toLowerCase() === 'null') return null
  return t
}

function splitMulti(v: string | null): string[] {
  if (!v) return []
  return v
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function firstNonEmpty(arr: string[]): string | null {
  return arr.length > 0 ? arr[0] : null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseDateOrFallback(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  for (const candidate of [primary, fallback]) {
    const v = nz(candidate ?? null)
    if (!v) continue
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  return null
}

/** Only the keys whose value is not null (a patch that never blanks a column). */
function definedOnly<T extends Record<string, string | null>>(o: T): Partial<Record<keyof T, string>> {
  const out: Partial<Record<keyof T, string>> = {}
  for (const k of Object.keys(o) as Array<keyof T>) {
    const v = o[k]
    if (v !== null) out[k] = v
  }
  return out
}

function buildUnitNotes(p: LotPropertyRow): string | null {
  const parts: string[] = []
  const propType = nz(p.property_type)
  if (propType) parts.push(propType)
  const occ = nz(p.occupancy_type)
  if (occ) parts.push(`occupancy: ${occ}`)
  const status = nz(p.status)
  if (status) parts.push(`status: ${status}`)
  const noteText = nz(p.notes)
  if (noteText) parts.push(noteText)
  const mailing = nz(p.mailing_address)
  if (mailing) parts.push(`Mailing address: ${mailing}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

// ─── CSV parser — RFC 4180-ish, handles quoted fields with commas ───

export function parseCsv<T>(text: string): T[] {
  const rows = parseCsvTable(text)
  if (rows.length === 0) return []
  const header = rows[0]
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {}
    header.forEach((col, i) => {
      obj[col] = row[i] ?? ''
    })
    return obj as unknown as T
  })
}

/** The raw table: one array of cells per non-empty line, header included. */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (ch === '"') {
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}
