'use server'

// Server action for the CSV-based bulk import of properties + residents.
//
// Lives in the platform-admin tree → already gated by the layout, but
// requirePlatformAdmin() is called again here for defense-in-depth.
// Service-role writes happen through createAdminClient() which uses
// the Vercel-provided SUPABASE_SERVICE_ROLE_KEY at runtime (no env
// vars on the operator's laptop).

import { createAdminClient } from '@homeowner-portal/db'
import { requirePlatformAdmin } from '@/lib/platform-admin'

export interface ImportResult {
  ok: boolean
  error?: string
  dryRun: boolean
  units:      { inserted: number; reused: number; errored: number }
  ownerships: { inserted: number; reused: number; errored: number }
  tenancies:  { inserted: number; reused: number; errored: number }
  skipped: number
  warnings: string[]   // capped at 30 so the UI doesn't explode
}

export interface ImportInput {
  orgId: string
  associationId: string | null
  propertiesCsv: string
  residentsCsv: string
  apply: boolean
}

interface PropertyRow {
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

interface ResidentRow {
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
  emergency_contact_name: string
  emergency_contact_phone: string
  vehicles: string
  pets: string
  notes: string
  first_name: string
  last_name: string
  relationship: string
  status: string
  created_at: string
  tenant_id: string
}

export async function runImport(input: ImportInput): Promise<ImportResult> {
  await requirePlatformAdmin()

  const result: ImportResult = {
    ok: true,
    dryRun: !input.apply,
    units:      { inserted: 0, reused: 0, errored: 0 },
    ownerships: { inserted: 0, reused: 0, errored: 0 },
    tenancies:  { inserted: 0, reused: 0, errored: 0 },
    skipped: 0,
    warnings: [],
  }

  let properties: PropertyRow[]
  let residents: ResidentRow[]
  try {
    properties = parseCsv<PropertyRow>(input.propertiesCsv)
    residents = parseCsv<ResidentRow>(input.residentsCsv)
  } catch (err) {
    return {
      ...result,
      ok: false,
      error: `CSV parse failed: ${(err as Error).message}`,
    }
  }

  const db = createAdminClient()
  const propIdToUnitId = new Map<string, string>()

  // ─── 1. properties → units ───────────────────────────────────────
  for (const p of properties) {
    const addressLine1 = nz(p.address_line1) ?? nz(p.address) ?? ''
    if (!addressLine1) {
      pushWarn(result, `skip property ${p.id}: no address`)
      result.units.errored += 1
      continue
    }

    const { data: existing } = await db
      .from('units')
      .select('id')
      .eq('organization_id', input.orgId)
      .eq('address_line1', addressLine1)
      .maybeSingle<{ id: string }>()

    if (existing) {
      propIdToUnitId.set(p.id, existing.id)
      result.units.reused += 1
      continue
    }

    if (!input.apply) {
      // Dry-run: use source id as a stand-in so resident lookups still
      // produce consistent counts.
      propIdToUnitId.set(p.id, p.id)
      result.units.inserted += 1
      continue
    }

    const insertRow = {
      organization_id: input.orgId,
      association_id: input.associationId,
      address_line1: addressLine1,
      address_line2: nz(p.address_line2),
      city: nz(p.city),
      state: nz(p.state),
      postal_code: nz(p.zip),
      unit_number: nz(p.unit),
      lot_number: nz(p.lot_number),
      notes: buildUnitNotes(p),
    }

    const { data: inserted, error } = await db
      .from('units')
      .insert(insertRow as never)
      .select('id')
      .single<{ id: string }>()

    if (error || !inserted) {
      pushWarn(result, `unit "${addressLine1}": ${error?.message ?? 'unknown'}`)
      result.units.errored += 1
      continue
    }
    propIdToUnitId.set(p.id, inserted.id)
    result.units.inserted += 1
  }

  // ─── 2. residents → ownerships / tenancies ───────────────────────
  for (const r of residents) {
    const unitId = propIdToUnitId.get(r.property_id)
    if (!unitId) {
      pushWarn(result, `skip resident "${nz(r.full_name) ?? r.id}": no matching property (${r.property_id})`)
      result.skipped += 1
      continue
    }

    const primaryEmail = firstNonEmpty(splitMulti(nz(r.email)))
    const primaryPhone = firstNonEmpty(splitMulti(nz(r.phone)))
    const fullName = nz(r.full_name)
      ?? [nz(r.first_name), nz(r.last_name)].filter(Boolean).join(' ').trim()
      ?? null
    const isCurrent = (r.is_current ?? '').toLowerCase() === 'true'
    const kind = (nz(r.type) ?? 'owner').toLowerCase()

    if (kind === 'owner') {
      if (!primaryEmail && !fullName) {
        pushWarn(result, `skip resident ${r.id}: no email or name to key on`)
        result.skipped += 1
        continue
      }

      // Lookup by (unit_id, lower(owner_email)) first, fall back to name.
      let existing: { id: string } | null = null
      if (primaryEmail) {
        const { data } = await db
          .from('ownerships')
          .select('id')
          .eq('unit_id', unitId)
          .ilike('owner_email', primaryEmail)
          .maybeSingle<{ id: string }>()
        existing = data
      } else if (fullName) {
        const { data } = await db
          .from('ownerships')
          .select('id')
          .eq('unit_id', unitId)
          .ilike('owner_name', fullName)
          .maybeSingle<{ id: string }>()
        existing = data
      }

      if (existing) {
        result.ownerships.reused += 1
        continue
      }

      if (!input.apply) {
        result.ownerships.inserted += 1
        continue
      }

      const validFrom = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const validTo = isCurrent ? null : parseDateOrFallback(r.move_out_date, null)

      const { error } = await db.from('ownerships').insert({
        organization_id: input.orgId,
        unit_id: unitId,
        owner_user_id: null,
        owner_name: fullName,
        owner_email: primaryEmail,
        owner_phone: primaryPhone,
        ownership_pct: 100,
        valid_from: validFrom,
        valid_to: validTo,
        source: 'csv_import',
      } as never)

      if (error) {
        pushWarn(result, `ownership "${fullName ?? primaryEmail}": ${error.message}`)
        result.ownerships.errored += 1
        continue
      }
      result.ownerships.inserted += 1
    } else if (kind === 'tenant' || kind === 'renter') {
      const leaseStart = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const leaseEnd = parseDateOrFallback(r.move_out_date, null)
      const status = isCurrent && !leaseEnd ? 'active' : 'ended'

      const { data: existing } = await db
        .from('tenancies')
        .select('id')
        .eq('unit_id', unitId)
        .eq('lease_start', leaseStart)
        .ilike('tenant_email', primaryEmail ?? '')
        .maybeSingle<{ id: string }>()

      if (existing) {
        result.tenancies.reused += 1
        continue
      }

      if (!input.apply) {
        result.tenancies.inserted += 1
        continue
      }

      const { error } = await db.from('tenancies').insert({
        organization_id: input.orgId,
        unit_id: unitId,
        tenant_user_id: null,
        tenant_name: fullName,
        tenant_email: primaryEmail,
        tenant_phone: primaryPhone,
        lease_start: leaseStart,
        lease_end: leaseEnd,
        status,
      } as never)

      if (error) {
        pushWarn(result, `tenancy "${fullName ?? primaryEmail}": ${error.message}`)
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

// ─── helpers ─────────────────────────────────────────────────────────

function pushWarn(result: ImportResult, msg: string): void {
  if (result.warnings.length < 30) result.warnings.push(msg)
}

function nz(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  if (t === '' || t.toLowerCase() === 'null') return null
  return t
}

function splitMulti(v: string | null): string[] {
  if (!v) return []
  return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

function firstNonEmpty(arr: string[]): string | null {
  return arr.length > 0 ? arr[0] : null
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseDateOrFallback(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  for (const candidate of [primary, fallback]) {
    const v = nz(candidate ?? null)
    if (!v) continue
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  return null
}

function buildUnitNotes(p: PropertyRow): string | null {
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

function parseCsv<T>(text: string): T[] {
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

// ─── Org + association loaders for the form dropdowns ────────────────

export interface OrgOption {
  id: string
  name: string
}
export interface AssociationOption {
  id: string
  name: string
  organization_id: string
  state: string | null
}

export async function loadImportFormOptions(): Promise<{
  orgs: OrgOption[]
  associations: AssociationOption[]
}> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const [{ data: orgs }, { data: assocs }] = await Promise.all([
    db.from('orgs' as never)
      .select('id, name')
      .order('name')
      .returns<OrgOption[]>(),
    db.from('associations' as never)
      .select('id, name, organization_id, state')
      .order('name')
      .returns<AssociationOption[]>(),
  ])

  return {
    orgs: orgs ?? [],
    associations: assocs ?? [],
  }
}
