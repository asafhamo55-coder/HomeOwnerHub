/**
 * scripts/migrate-properties-residents.ts
 *
 * One-shot migration: imports Properties.csv → units and Residents.csv
 * → ownerships (or tenancies for renters), keyed to a target
 * organization + association.
 *
 * The source CSVs were exported from another HomeownerHub instance, so
 * the column names line up. The script does NOT preserve source UUIDs
 * — it generates fresh IDs and builds a property_id → unit_id map
 * in-memory so residents land under the right units.
 *
 * Idempotent: re-running is safe.
 *   - A unit is matched by (organization_id, address_line1) — re-runs
 *     update the existing row instead of inserting a duplicate.
 *   - An ownership is matched by (unit_id, lower(owner_email)). Same
 *     for tenancies on tenant_email.
 *
 * Usage (from repo root):
 *
 *   # Dry run — parse + report, no DB writes:
 *   pnpm migrate:properties-residents \
 *     --org-id=<UUID> \
 *     --association-id=<UUID> \
 *     --properties=/Users/asafhamo/Downloads/Properties.csv \
 *     --residents=/Users/asafhamo/Downloads/Residents.csv
 *
 *   # Live run:
 *   ... same flags ... --apply
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 *
 * Quirks handled:
 *   - CSV uses the literal string "null" (not blank) for missing values
 *   - Some email / phone fields are comma-separated multi-values → we
 *     take the first as the primary and stash the rest in notes
 *   - vehicles/pets are JSON-array strings — folded into notes
 *   - lot_number in the CSV is numeric; units.lot_number is text
 *   - move_in_date is required for tenancies (lease_start NOT NULL) —
 *     we fall back to the CSV's created_at if blank, else today
 */

import './_load-env'
import fs from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

interface Args {
  orgId: string
  associationId: string | null
  propertiesPath: string
  residentsPath: string
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
  type: string                  // 'owner' | 'tenant'
  move_in_date: string
  move_out_date: string
  is_current: string            // 'true' | 'false'
  emergency_contact_name: string
  emergency_contact_phone: string
  vehicles: string              // JSON array literal
  pets: string                  // JSON array literal
  notes: string
  first_name: string
  last_name: string
  relationship: string
  status: string
  created_at: string
  tenant_id: string
}

async function main(): Promise<void> {
  const args = parseArgs()
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[migrate] Missing SUPABASE env vars.')
    console.error(`[migrate] diagnostic:
  NEXT_PUBLIC_SUPABASE_URL  = ${diagState(process.env.NEXT_PUBLIC_SUPABASE_URL)}
  SUPABASE_URL              = ${diagState(process.env.SUPABASE_URL)}
  SUPABASE_SERVICE_ROLE_KEY = ${diagState(process.env.SUPABASE_SERVICE_ROLE_KEY)}
  SUPABASE_SECRET_KEY       = ${diagState(process.env.SUPABASE_SECRET_KEY)}`)
    process.exit(1)
  }

  console.log(`[migrate] org=${args.orgId} association=${args.associationId ?? '(none)'}`)
  console.log(`[migrate] mode=${args.apply ? 'APPLY (writes to DB)' : 'DRY RUN'}`)

  const propsCsv = await fs.readFile(args.propertiesPath, 'utf-8')
  const resCsv = await fs.readFile(args.residentsPath, 'utf-8')
  const properties = parseCsv<PropertyRow>(propsCsv)
  const residents = parseCsv<ResidentRow>(resCsv)
  console.log(`[migrate] read ${properties.length} properties + ${residents.length} residents`)

  // Sanity: tenant_id consistent in both CSVs?
  const propTenants = new Set(properties.map((p) => p.tenant_id).filter(Boolean))
  const resTenants = new Set(residents.map((r) => r.tenant_id).filter(Boolean))
  console.log(`[migrate] source tenant_id(s) in properties: ${[...propTenants].join(', ') || '(none)'}`)
  console.log(`[migrate] source tenant_id(s) in residents:  ${[...resTenants].join(', ') || '(none)'}`)

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ─── Step 1: properties → units ────────────────────────────────────
  const propIdToUnitId = new Map<string, string>()
  let unitsInserted = 0
  let unitsReused = 0
  let unitsErrored = 0

  for (const p of properties) {
    const addressLine1 = nz(p.address_line1) ?? nz(p.address) ?? ''
    if (!addressLine1) {
      console.warn(`[migrate] skip property ${p.id}: no address`)
      unitsErrored += 1
      continue
    }

    // Look up by org + address — idempotent key.
    const { data: existing } = await db
      .from('units')
      .select('id')
      .eq('organization_id', args.orgId)
      .eq('address_line1', addressLine1)
      .maybeSingle<{ id: string }>()

    if (existing) {
      propIdToUnitId.set(p.id, existing.id)
      unitsReused += 1
      continue
    }

    if (!args.apply) {
      // Dry-run placeholder — use source id so resident lookups still
      // produce consistent reporting.
      propIdToUnitId.set(p.id, p.id)
      unitsInserted += 1
      continue
    }

    const insertRow = {
      organization_id: args.orgId,
      association_id: args.associationId,
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
      console.error(`[migrate] unit insert failed for "${addressLine1}": ${error?.message}`)
      unitsErrored += 1
      continue
    }
    propIdToUnitId.set(p.id, inserted.id)
    unitsInserted += 1
  }

  console.log(`[migrate] units: inserted ${unitsInserted}, reused ${unitsReused}, errored ${unitsErrored}`)

  // ─── Step 2: residents → ownerships / tenancies ────────────────────
  let ownInserted = 0, ownReused = 0, ownErrored = 0
  let tenInserted = 0, tenReused = 0, tenErrored = 0
  let skipped = 0

  for (const r of residents) {
    const unitId = propIdToUnitId.get(r.property_id)
    if (!unitId) {
      console.warn(`[migrate] skip resident "${r.full_name}": no matching property (${r.property_id})`)
      skipped += 1
      continue
    }

    const primaryEmail = firstNonEmpty(splitMulti(nz(r.email)))
    const primaryPhone = firstNonEmpty(splitMulti(nz(r.phone)))
    const fullName = nz(r.full_name)
      ?? [nz(r.first_name), nz(r.last_name)].filter(Boolean).join(' ').trim()
      ?? null
    const notes = buildResidentNotes(r)
    const isCurrent = (r.is_current ?? '').toLowerCase() === 'true'
    const kind = (nz(r.type) ?? 'owner').toLowerCase()

    if (kind === 'owner') {
      // Match by (unit_id, lower(owner_email)) if email present, else
      // by (unit_id, lower(owner_name)). Without either we can't
      // de-dupe — skip.
      if (!primaryEmail && !fullName) {
        console.warn(`[migrate] skip resident ${r.id}: no email or name to key on`)
        skipped += 1
        continue
      }

      const lookup = db
        .from('ownerships')
        .select('id')
        .eq('unit_id', unitId)
      const { data: existing } = primaryEmail
        ? await lookup.ilike('owner_email', primaryEmail).maybeSingle<{ id: string }>()
        : await lookup.ilike('owner_name', fullName!).maybeSingle<{ id: string }>()

      if (existing) {
        ownReused += 1
        continue
      }

      if (!args.apply) {
        ownInserted += 1
        continue
      }

      const validFrom = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const validTo = isCurrent ? null : parseDateOrFallback(r.move_out_date, null)

      const insertRow = {
        organization_id: args.orgId,
        unit_id: unitId,
        owner_user_id: null,
        owner_name: fullName,
        owner_email: primaryEmail,
        owner_phone: primaryPhone,
        ownership_pct: 100,
        valid_from: validFrom,
        valid_to: validTo,
        source: 'csv_import',
      }

      const { error } = await db.from('ownerships').insert(insertRow as never)
      if (error) {
        console.error(`[migrate] ownership insert failed for ${fullName}: ${error.message}`)
        ownErrored += 1
        continue
      }
      ownInserted += 1
      // ownership doesn't carry notes; if we want notes/emergency
      // contact persisted, add them to units.notes (best-effort, only
      // when distinct).
      if (notes && args.apply) {
        await appendUnitNote(db, unitId, `[${fullName}] ${notes}`)
      }
    } else if (kind === 'tenant' || kind === 'renter') {
      const leaseStart = parseDateOrFallback(r.move_in_date, r.created_at) ?? todayIso()
      const leaseEnd = parseDateOrFallback(r.move_out_date, null)
      const status = isCurrent && !leaseEnd ? 'active' : 'ended'

      // Idempotency key for tenancies: (unit_id, lease_start, lower(tenant_email))
      const { data: existing } = await db
        .from('tenancies')
        .select('id')
        .eq('unit_id', unitId)
        .eq('lease_start', leaseStart)
        .ilike('tenant_email', primaryEmail ?? '')
        .maybeSingle<{ id: string }>()

      if (existing) {
        tenReused += 1
        continue
      }

      if (!args.apply) {
        tenInserted += 1
        continue
      }

      const insertRow = {
        organization_id: args.orgId,
        unit_id: unitId,
        tenant_user_id: null,
        tenant_name: fullName,
        tenant_email: primaryEmail,
        tenant_phone: primaryPhone,
        lease_start: leaseStart,
        lease_end: leaseEnd,
        status,
      }

      const { error } = await db.from('tenancies').insert(insertRow as never)
      if (error) {
        console.error(`[migrate] tenancy insert failed for ${fullName}: ${error.message}`)
        tenErrored += 1
        continue
      }
      tenInserted += 1
    } else {
      console.warn(`[migrate] skip resident ${r.id}: unknown type "${r.type}"`)
      skipped += 1
    }
  }

  console.log(`[migrate] ownerships:  inserted ${ownInserted}, reused ${ownReused}, errored ${ownErrored}`)
  console.log(`[migrate] tenancies:   inserted ${tenInserted}, reused ${tenReused}, errored ${tenErrored}`)
  console.log(`[migrate] skipped:     ${skipped}`)

  if (!args.apply) {
    console.log(`[migrate] DRY RUN — re-run with --apply to write to DB.`)
  } else {
    console.log(`[migrate] done.`)
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

function diagState(v: string | undefined): string {
  if (v === undefined) return 'UNSET'
  if (v === '') return 'EMPTY'
  return `SET (len ${v.length})`
}

/** Treats the literal string "null" the same as empty. */
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
    // Accept YYYY-MM-DD or ISO-with-time
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

function buildResidentNotes(r: ResidentRow): string | null {
  const parts: string[] = []
  const relationship = nz(r.relationship)
  if (relationship) parts.push(relationship)
  const emergencyName = nz(r.emergency_contact_name)
  const emergencyPhone = nz(r.emergency_contact_phone)
  if (emergencyName || emergencyPhone) {
    parts.push(`emergency: ${[emergencyName, emergencyPhone].filter(Boolean).join(' / ')}`)
  }
  const vehicles = parseJsonArray(r.vehicles)
  if (vehicles.length > 0) parts.push(`vehicles: ${vehicles.join(', ')}`)
  const pets = parseJsonArray(r.pets)
  if (pets.length > 0) parts.push(`pets: ${pets.join(', ')}`)
  const note = nz(r.notes)
  if (note) parts.push(note)
  return parts.length > 0 ? parts.join(' · ') : null
}

function parseJsonArray(v: string | undefined | null): string[] {
  const t = nz(v ?? null)
  if (!t) return []
  try {
    const parsed = JSON.parse(t)
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean)
    }
  } catch {
    /* fall through */
  }
  return []
}

async function appendUnitNote(
  db: ReturnType<typeof createClient>,
  unitId: string,
  note: string,
): Promise<void> {
  const { data } = await db
    .from('units')
    .select('notes')
    .eq('id', unitId)
    .maybeSingle<{ notes: string | null }>()
  const current = data?.notes ?? ''
  if (current.includes(note)) return
  const next = current ? `${current}\n${note}` : note
  await db.from('units').update({ notes: next } as never).eq('id', unitId)
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
      // Handle \r\n
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

// ─── CLI parsing ─────────────────────────────────────────────────────

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (key: string): string | undefined => {
    const direct = argv.find((a) => a.startsWith(`--${key}=`))
    if (direct) return direct.slice(key.length + 3)
    const flagIdx = argv.indexOf(`--${key}`)
    if (flagIdx >= 0 && argv[flagIdx + 1] && !argv[flagIdx + 1].startsWith('--')) {
      return argv[flagIdx + 1]
    }
    return undefined
  }

  const orgId = get('org-id')
  const associationId = get('association-id') ?? null
  const propertiesPath = get('properties') ?? '/Users/asafhamo/Downloads/Properties.csv'
  const residentsPath = get('residents') ?? '/Users/asafhamo/Downloads/Residents.csv'
  const apply = argv.includes('--apply')

  if (!orgId) {
    console.error(`Usage:
  pnpm migrate:properties-residents \\
    --org-id=<UUID> \\
    --association-id=<UUID> \\
    --properties=<path>  (default: /Users/asafhamo/Downloads/Properties.csv) \\
    --residents=<path>   (default: /Users/asafhamo/Downloads/Residents.csv) \\
    [--apply]            (omit for dry-run)`)
    process.exit(1)
  }

  return { orgId, associationId, propertiesPath, residentsPath, apply }
}

main().catch((err) => {
  console.error('[migrate] fatal:', err)
  process.exit(1)
})
