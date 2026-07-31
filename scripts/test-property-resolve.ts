/**
 * scripts/test-property-resolve.ts
 *
 * Integration check for lib/properties/resolve.ts against real Postgres.
 * Read-only — creates nothing, deletes nothing.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/test-property-resolve.ts
 *
 * Deviation from spec: falls back to the non-prefixed `SUPABASE_URL` when
 * `NEXT_PUBLIC_SUPABASE_URL` is unset or empty. Vercel stores the
 * `NEXT_PUBLIC_*` copy as a Sensitive var, so `vercel env pull` writes an
 * empty string for it in some environments even though the non-prefixed
 * name is populated. Treat empty string the same as unset.
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import {
  getPropertyRef,
  resolvePropertyByEmail,
} from '../apps/hoa/src/lib/properties/resolve'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient<Database>(url, key)

let failures = 0
let skipped = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function skip(name: string, reason: string): void {
  console.log(`SKIP  ${name} — ${reason}`)
  skipped++
}

async function main(): Promise<void> {
  const { data: org } = await db
    .from('orgs')
    .select('id, name')
    .eq('hub_type', 'hoa')
    .limit(1)
    .maybeSingle()

  if (!org) {
    console.error('No HOA org found — seed one first.')
    process.exit(1)
  }
  console.log(`Org: ${org.name} (${org.id})\n`)

  // A: every unit bridges
  const { data: units } = await db
    .from('units')
    .select('id, address_line1, legacy_hoa_property_id')
    .eq('organization_id', org.id)

  const unbridged = (units ?? []).filter((u) => !u.legacy_hoa_property_id)
  check(
    'A. all units bridged to hoa_properties',
    unbridged.length === 0,
    `${unbridged.length} unbridged of ${units?.length ?? 0}`,
  )

  // B: getPropertyRef round-trips
  const sample = units?.[0]
  if (sample) {
    const ref = await getPropertyRef(db, org.id, sample.id)
    check(
      'B. getPropertyRef returns the unit',
      ref?.unitId === sample.id && ref?.address === sample.address_line1,
      ref ? `${ref.address}` : 'null',
    )
  } else {
    skip('B. getPropertyRef returns the unit', 'org has no units')
  }

  // C: a known resident email resolves to a property
  const { data: resident } = await db
    .from('property_residents')
    .select('email, full_name')
    .eq('organization_id', org.id)
    .is('moved_out_at', null)
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle()

  if (resident?.email) {
    const found = await resolvePropertyByEmail(db, org.id, resident.email)
    check(
      'C. resident email resolves to >=1 property',
      found.length > 0,
      `${resident.email} → ${found.length} match(es)`,
    )
    check(
      'C2. match is case-insensitive',
      (await resolvePropertyByEmail(db, org.id, resident.email.toUpperCase()))
        .length === found.length,
    )
  } else {
    skip('C. resident email resolves to >=1 property', 'no property_residents with an email')
    skip('C2. match is case-insensitive', 'no property_residents with an email')
  }

  // D: unknown email resolves to nothing
  const none = await resolvePropertyByEmail(db, org.id, 'nobody@example.invalid')
  check('D. unknown email resolves to 0 properties', none.length === 0)

  // E: the multi-match invariant — one owner with several units must
  // return several matches. This is the single most safety-critical
  // behavior of this module; collapsing to one match is the defect this
  // design exists to prevent.
  const { data: allResidents } = await db
    .from('property_residents')
    .select('email, property_id')
    .eq('organization_id', org.id)
    .is('moved_out_at', null)
    .not('email', 'is', null)

  const propertyIdToUnitId = new Map<string, string>()
  for (const u of units ?? []) {
    if (u.legacy_hoa_property_id) {
      propertyIdToUnitId.set(u.legacy_hoa_property_id, u.id)
    }
  }

  const emailToUnitIds = new Map<string, Set<string>>()
  for (const r of allResidents ?? []) {
    if (!r.email) continue
    const unitId = propertyIdToUnitId.get(r.property_id)
    if (!unitId) continue
    const key = r.email.trim().toLowerCase()
    const set = emailToUnitIds.get(key) ?? new Set<string>()
    set.add(unitId)
    emailToUnitIds.set(key, set)
  }

  const multiUnitEmail = [...emailToUnitIds.entries()].find(
    ([, unitIds]) => unitIds.size >= 2,
  )

  if (multiUnitEmail) {
    const [email, unitIds] = multiUnitEmail
    const found = await resolvePropertyByEmail(db, org.id, email)
    check(
      'E. one owner with several units resolves to several matches',
      found.length > 1,
      `${unitIds.size} distinct units → ${found.length} match(es)`,
    )
  } else {
    skip(
      'E. one owner with several units resolves to several matches',
      'no fixture: no email spans >=2 distinct bridged units in this org',
    )
  }

  if (skipped > 0) {
    console.log(`\n${skipped} CHECK(S) COULD NOT RUN — RESULT IS NOT A PASS`)
    process.exit(1)
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
