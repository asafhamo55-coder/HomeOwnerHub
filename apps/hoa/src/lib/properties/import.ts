/**
 * Properties.csv + Residents.csv → whole lots (C0.4).
 *
 * The import used to write only `units` / `ownerships` / `tenancies`, so
 * imported lots were invisible on /properties until someone ran two
 * hand-edited SQL files hardcoded to the pilot org
 * (migrations/mirror-units-to-hoa-properties.sql and
 * backfill-owners-as-residents.sql, now deleted). It now writes both
 * sides itself:
 *
 *   property row → hoa_properties (matched by normalized address, else
 *                  created) + units (bridged via legacy_hoa_property_id)
 *   owner row    → ownerships + a property_residents owner row, and the
 *                  property's inline owner_* when it has none yet
 *   tenant row   → tenancies
 *
 * Re-runnable: every step reuses what it finds. Re-running it over a CSV
 * imported before this change links the existing units to their existing
 * properties instead of duplicating them.
 *
 * Runs with the service-role client (platform-admin only), so every read
 * and write is scoped to `orgId` explicitly. The caller gates first.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { normalizeAddress } from './normalize-address'

type Db = SupabaseClient<Database>

interface Counter {
  inserted: number
  reused: number
  errored: number
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
  skipped: number
  warnings: string[] // capped at 30 so the UI doesn't explode
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

export async function runUnitsImport(db: Db, input: ImportInput): Promise<ImportResult> {
  const { orgId } = input
  const result: ImportResult = {
    ok: true,
    dryRun: !input.apply,
    properties: counter(),
    units: counter(),
    ownerships: counter(),
    residents: counter(),
    tenancies: counter(),
    skipped: 0,
    warnings: [],
  }

  let properties: PropertyCsvRow[]
  let residents: ResidentCsvRow[]
  try {
    properties = parseCsv<PropertyCsvRow>(input.propertiesCsv)
    residents = parseCsv<ResidentCsvRow>(input.residentsCsv)
  } catch (err) {
    return { ...result, ok: false, error: `CSV parse failed: ${(err as Error).message}` }
  }

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

  // Live properties by normalized address: how an imported row finds the
  // property it already has (same rule as the 0028 bridge backfill). An
  // address shared by two live properties is ambiguous and is not linked.
  const byAddress = new Map<string, string[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('hoa_properties')
      .select('id, address')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) {
      logFailure('read.hoa_properties', error, { orgId })
      return { ...result, ok: false, error: 'Couldn’t read existing properties. Nothing was written.' }
    }
    for (const p of (data ?? []) as Array<{ id: string; address: string }>) {
      const key = normalizeAddress(p.address)
      if (!key) continue
      byAddress.set(key, [...(byAddress.get(key) ?? []), p.id])
    }
    if (!data || data.length < 1000) break
  }
  const findProperty = (address: string): string | null | 'ambiguous' => {
    const hits = byAddress.get(normalizeAddress(address)) ?? []
    return hits.length === 1 ? hits[0] : hits.length > 1 ? 'ambiguous' : null
  }

  const insertProperty = async (p: PropertyCsvRow, addressLine1: string): Promise<string | null> => {
    const { data, error } = await db
      .from('hoa_properties')
      .insert({
        org_id: orgId,
        address: addressLine1,
        unit_number: nz(p.unit),
        notes: buildUnitNotes(p),
      })
      .select('id')
      .single<{ id: string }>()
    if (error || !data) {
      logFailure('insert.hoa_properties', error, { orgId })
      return null
    }
    byAddress.set(normalizeAddress(addressLine1), [data.id])
    return data.id
  }

  const lots = new Map<string, LotRef>() // CSV property id → lot

  // ─── 1. properties → hoa_properties + units ─────────────────────
  for (const p of properties) {
    const addressLine1 = nz(p.address_line1) ?? nz(p.address) ?? ''
    if (!addressLine1) {
      pushWarn(result, `skip property ${p.id}: no address`)
      result.units.errored += 1
      continue
    }

    const { data: existingUnits, error: unitReadErr } = await db
      .from('units')
      .select('id, legacy_hoa_property_id, created_at')
      .eq('organization_id', orgId)
      .eq('address_line1', addressLine1)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
    if (unitReadErr) {
      logFailure('read.units', unitReadErr, { orgId })
      pushWarn(result, `property ${p.id}: could not check for an existing unit`)
      result.units.errored += 1
      continue
    }
    const existing = ((existingUnits ?? []) as Array<{ id: string; legacy_hoa_property_id: string | null }>)[0]

    const match = findProperty(addressLine1)
    if (match === 'ambiguous') {
      pushWarn(result, `property ${p.id}: several existing properties share this address; not linked`)
    }
    const matchedId = match === 'ambiguous' ? null : match

    if (existing) {
      result.units.reused += 1
      if (existing.legacy_hoa_property_id) {
        result.properties.reused += 1
        lots.set(p.id, { unitId: existing.id, propertyId: existing.legacy_hoa_property_id })
        continue
      }
      // An earlier import's unit with no property: link it now.
      if (!input.apply) {
        if (matchedId) result.properties.reused += 1
        else if (match !== 'ambiguous') result.properties.inserted += 1
        lots.set(p.id, { unitId: existing.id, propertyId: matchedId ?? (match === 'ambiguous' ? null : `dry:${p.id}`) })
        continue
      }
      if (match === 'ambiguous') {
        lots.set(p.id, { unitId: existing.id, propertyId: null })
        continue
      }
      let propertyId = matchedId
      const created = !propertyId
      if (!propertyId) propertyId = await insertProperty(p, addressLine1)
      if (!propertyId) {
        pushWarn(result, `property ${p.id}: could not create its property record`)
        result.properties.errored += 1
        lots.set(p.id, { unitId: existing.id, propertyId: null })
        continue
      }
      const { error: linkErr } = await db
        .from('units')
        .update({ legacy_hoa_property_id: propertyId })
        .eq('id', existing.id)
        .eq('organization_id', orgId)
      if (linkErr) {
        logFailure('link.units', linkErr, { orgId, unitId: existing.id })
        if (created) await db.from('hoa_properties').delete().eq('id', propertyId).eq('org_id', orgId)
        pushWarn(result, `property ${p.id}: could not link its unit`)
        result.properties.errored += 1
        lots.set(p.id, { unitId: existing.id, propertyId: null })
        continue
      }
      result.properties[created ? 'inserted' : 'reused'] += 1
      lots.set(p.id, { unitId: existing.id, propertyId })
      continue
    }

    if (!input.apply) {
      // Dry run: the source id stands in so resident lookups still count.
      result.units.inserted += 1
      if (matchedId) result.properties.reused += 1
      else if (match !== 'ambiguous') result.properties.inserted += 1
      lots.set(p.id, { unitId: `dry:${p.id}`, propertyId: matchedId ?? (match === 'ambiguous' ? null : `dry:${p.id}`) })
      continue
    }

    // New lot: the property first (or the one already there), then the
    // unit carrying the bridge. A failed unit insert removes a property
    // this run created, so no half lot is left.
    let propertyId: string | null = matchedId
    const created = !propertyId && match !== 'ambiguous'
    if (created) {
      propertyId = await insertProperty(p, addressLine1)
      if (!propertyId) {
        pushWarn(result, `property ${p.id}: could not create its property record`)
        result.properties.errored += 1
        result.units.errored += 1
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
        unit_number: nz(p.unit),
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
        byAddress.delete(normalizeAddress(addressLine1))
      }
      pushWarn(result, `property ${p.id}: could not create its unit`)
      result.units.errored += 1
      if (created) result.properties.errored += 1
      continue
    }
    result.units.inserted += 1
    if (propertyId) result.properties[created ? 'inserted' : 'reused'] += 1
    lots.set(p.id, { unitId: inserted.id, propertyId })
  }

  // ─── 2. residents → ownerships / property_residents / tenancies ──
  const primaryTaken = new Set<string>() // property ids that already have a primary owner resident
  for (const r of residents) {
    const lot = lots.get(r.property_id)
    if (!lot) {
      pushWarn(result, `skip resident ${r.id}: no matching property (${r.property_id})`)
      result.skipped += 1
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
        continue
      }

      // Lookup by (unit_id, lower(owner_email)) first, fall back to name.
      let existingOwnership = false
      if (!unitId.startsWith('dry:')) {
        const q = db.from('ownerships').select('id').eq('organization_id', orgId).eq('unit_id', unitId)
        const { data } = await (primaryEmail
          ? q.ilike('owner_email', escapeLike(primaryEmail))
          : q.ilike('owner_name', escapeLike(fullName ?? ''))
        ).limit(1)
        existingOwnership = (data ?? []).length > 0
      }

      const validFrom = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const validTo = isCurrent ? null : parseDateOrFallback(r.move_out_date, null)

      if (existingOwnership) result.ownerships.reused += 1
      else if (!input.apply) result.ownerships.inserted += 1
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
          continue
        }
        result.ownerships.inserted += 1
      }

      // The /properties side: a current owner shows on the Residents card
      // and, when the property has none, as its inline owner.
      if (validTo !== null || !lot.propertyId) continue
      await writeOwnerResident(db, result, input.apply, orgId, lot.propertyId, primaryTaken, {
        residentRef: r.id,
        fullName,
        email: primaryEmail,
        phone: primaryPhone,
        movedInAt: validFrom,
      })
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
        continue
      }
      if (!input.apply) {
        result.tenancies.inserted += 1
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
        continue
      }
      result.tenancies.inserted += 1
    } else {
      pushWarn(result, `skip resident ${r.id}: unknown type "${r.type}"`)
      result.skipped += 1
    }
  }

  return result
}

/**
 * The owner as a property_residents row (what the backfill script did),
 * skipped when the property already has a current resident with that
 * email (or name, when there is no email). The first owner of a property
 * with no primary owner yet is marked primary and becomes its inline
 * owner_* when those are empty.
 */
async function writeOwnerResident(
  db: Db,
  result: ImportResult,
  apply: boolean,
  orgId: string,
  propertyId: string,
  primaryTaken: Set<string>,
  owner: { residentRef: string; fullName: string | null; email: string | null; phone: string | null; movedInAt: string },
): Promise<void> {
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
      return
    }
    current = (data ?? []) as typeof current
  }
  if (current.some((c) => c.role === 'owner' && c.is_primary)) primaryTaken.add(propertyId)

  const lower = (s: string | null) => (s ?? '').trim().toLowerCase()
  const already = current.some((c) =>
    owner.email ? lower(c.email) === lower(owner.email) : lower(c.full_name) === lower(owner.fullName),
  )
  if (already) {
    result.residents.reused += 1
    return
  }
  const isPrimary = !primaryTaken.has(propertyId)
  primaryTaken.add(propertyId)
  if (!apply) {
    result.residents.inserted += 1
    return
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
    return
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

function buildUnitNotes(p: PropertyCsvRow): string | null {
  const parts: string[] = []
  const propType = nz(p.property_type)
  if (propType) parts.push(propType)
  const occ = nz(p.occupancy_type)
  if (occ) parts.push(`occupancy: ${occ}`)
  const status = nz(p.status)
  if (status) parts.push(`status: ${status}`)
  const noteText = nz(p.notes)
  if (noteText) parts.push(noteText)
  return parts.length > 0 ? parts.join(' · ') : null
}

// ─── CSV parser — RFC 4180-ish, handles quoted fields with commas ───

export function parseCsv<T>(text: string): T[] {
  const rows = parseCsvRaw(text)
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

function parseCsvRaw(text: string): string[][] {
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
