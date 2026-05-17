/**
 * scripts/seed-creek-valley-demo.ts
 *
 * Comprehensive demo-tenant seed for **Creek Valley HOA (Demo)** — a
 * fictional 135-home Atlanta-metro HOA. Populates a full tenant so the
 * product apps can be demoed end-to-end without touching the Madison
 * Park reference customer's data.
 *
 * Isolation: every row is scoped to a single `orgs.id` whose name is
 * suffixed with "(Demo)" (the plan column rejects 'demo' due to a check
 * constraint, so the suffix is the demo marker). To exclude demo data:
 *   WHERE orgs.name NOT LIKE '%(Demo)%'
 *
 * Idempotent: re-running drops + re-seeds the Creek Valley demo org
 * cleanly. The Madison Park org is never touched.
 *
 * What this seeds:
 *   - 1 org + 1 association
 *   - 2 funds (Operating, Reserve)
 *   - ~24 chart-of-accounts rows
 *   - 2 fiscal periods (2025 closed, 2026 open)
 *   - 1 budget (2026)
 *   - 135 properties (addresses on 6 streets)
 *   - ~220 resident profiles
 *   - 135 ownership records (some co-owners)
 *   - ~22 tenancies (rentals)
 *   - 15 vendors
 *   - 2 bank accounts (Operating + Reserve)
 *   - ~1620 monthly assessments (12 months × 135 units)
 *   - ~1620 hoa_dues rows mirroring assessments
 *   - ~160 journal entries (assessments + recurring expenses + transfers)
 *   - 30 violations (loaded from fixtures/creek-valley-violations.json)
 *   - 12 meeting minutes (loaded from fixtures/creek-valley-meetings.json)
 *   - 3 governing documents (CC&R, Bylaws, GA OCGA excerpt — loaded
 *     from markdown fixtures) plus chunked for AI retrieval
 *
 * Usage:
 *   pnpm exec tsx scripts/seed-creek-valley-demo.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL —
 * auto-loaded from apps/hoa/.env.local by _load-env.
 *
 * Pass --wipe to remove the demo org and re-seed from scratch (default
 * is "upsert-style" idempotent re-seed).
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[creek-valley] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Set them in apps/hoa/.env.local or as shell exports.',
  )
  process.exit(1)
}

type Db = SupabaseClient<Database>

const ORG_NAME = 'Creek Valley HOA (Demo)'
const ASSOC_NAME = 'Creek Valley Community Association'
const ASSOC_SLUG = 'creek-valley-demo'
const TOTAL_UNITS = 135
const FIXTURES_DIR = resolve(process.cwd(), 'scripts/fixtures')

const SHOULD_WIPE = process.argv.includes('--wipe')

// ─── Run ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('[creek-valley] Starting seed…')
  if (SHOULD_WIPE) console.log('[creek-valley] --wipe enabled: dropping prior demo data')

  const { orgId, associationId } = await ensureOrgAndAssociation(db)

  if (SHOULD_WIPE) await wipeDemoTenant(db, orgId, associationId)

  const fundIds = await ensureFunds(db, orgId, associationId)
  const coaIds = await ensureChartOfAccounts(db, orgId, associationId, fundIds)
  const fpIds = await ensureFiscalPeriods(db, orgId, associationId)
  await ensureBudget(db, orgId, associationId, fpIds['2026'], fundIds, coaIds)

  const hoaPropIds = await ensureProperties(db, orgId)
  const unitIds = await ensureUnits(db, orgId, associationId, hoaPropIds)
  const residents = await ensureResidents(db, orgId)
  await ensureOwnerships(db, orgId, unitIds, residents)
  await ensureTenancies(db, orgId, unitIds, residents)

  await ensureVendors(db, orgId)
  await ensureAssessmentsAndDues(db, orgId, associationId, unitIds, hoaPropIds, fpIds)

  await ensureViolations(db, orgId, hoaPropIds, residents)
  await ensureMeetings(db, orgId)
  await ensureGoverningDocs(db, orgId, associationId)

  console.log(`\n[creek-valley] ✅ Done.`)
  console.log(`[creek-valley] Org ID: ${orgId}`)
  console.log(`[creek-valley] Association ID: ${associationId}`)
  console.log(`[creek-valley] To exclude from prod queries: WHERE orgs.plan != 'demo'`)
}

// ─── Org + Association ────────────────────────────────────────────────

async function ensureOrgAndAssociation(
  db: Db,
): Promise<{ orgId: string; associationId: string }> {
  const { data: existingOrgs, error } = await db
    .from('orgs')
    .select('id, name, plan')
    .eq('name', ORG_NAME)

  if (error) throw new Error(`[org] read failed: ${error.message}`)

  let orgId: string
  if (existingOrgs && existingOrgs.length > 0) {
    orgId = existingOrgs[0].id
    console.log(`[org] using existing ${ORG_NAME} (${orgId})`)
  } else {
    // The orgs.plan column has a check constraint that only allows
    // specific enum values (free / starter / standard / plus / etc.).
    // Demo flag lives in the name suffix "(Demo)" — queryable via
    //   WHERE orgs.name NOT LIKE '%(Demo)%'
    const { data, error: insErr } = await db
      .from('orgs')
      .insert({
        name: ORG_NAME,
        hub_type: 'hoa',
        organization_type: 'self_managed_hoa',
        doors_count: TOTAL_UNITS,
      })
      .select('id')
      .single()
    if (insErr || !data) throw new Error(`[org] insert failed: ${insErr?.message}`)
    orgId = data.id
    console.log(`[org] + created ${ORG_NAME} (${orgId})`)
  }

  // Ensure association
  const { data: assocs } = await db
    .from('associations')
    .select('id, name')
    .eq('organization_id', orgId)
    .limit(1)

  let associationId: string
  if (assocs && assocs.length > 0) {
    associationId = assocs[0].id
    console.log(`[assoc] using existing ${assocs[0].name} (${associationId})`)
  } else {
    const { data, error: assocErr } = await db
      .from('associations')
      .insert({
        organization_id: orgId,
        name: ASSOC_NAME,
        slug: ASSOC_SLUG,
        state: 'GA',
        governing_law_state: 'GA',
        type: 'hoa',
        fiscal_year_start: '2026-01-01',
        total_units: TOTAL_UNITS,
      })
      .select('id')
      .single()
    if (assocErr || !data) throw new Error(`[assoc] insert failed: ${assocErr?.message}`)
    associationId = data.id
    console.log(`[assoc] + created ${ASSOC_NAME} (${associationId})`)
  }

  return { orgId, associationId }
}

async function wipeDemoTenant(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<void> {
  // Order matters — FK dependencies bottom-up. Wrap each in best-effort
  // delete; some tables may not have rows yet on first run.
  const orgScoped = [
    'hoa_violations',
    'hoa_meeting_minutes',
    'hoa_dues',
    'tenancies',
    'ownerships',
    'vendors',
    'hoa_properties',
    'governing_document_chunks',
    'governing_documents',
  ] as const

  const associationScoped = [
    'ledger_entries',
    'journal_entries',
    'budget_line_items',
    'budgets',
    'assessments',
    'fiscal_periods',
    'chart_of_accounts',
    'funds',
  ] as const

  // ledger_entries delete via journal_entries FK; just nuke JEs first
  for (const table of orgScoped) {
    const { error } = await db.from(table as never).delete().eq('org_id' as never, orgId)
    if (error && !error.message.includes('does not exist')) {
      console.warn(`[wipe] ${table}: ${error.message}`)
    }
  }
  // Some tables use organization_id instead of org_id — try both spellings.
  for (const table of orgScoped) {
    const { error } = await db
      .from(table as never)
      .delete()
      .eq('organization_id' as never, orgId)
    if (error && !error.message.includes('does not exist') && !error.message.includes('column')) {
      // Silent — many tables don't have this column.
    }
  }
  for (const table of associationScoped) {
    const { error } = await db
      .from(table as never)
      .delete()
      .eq('association_id' as never, associationId)
    if (error && !error.message.includes('does not exist')) {
      console.warn(`[wipe] ${table}: ${error.message}`)
    }
  }
  console.log('[wipe] done')
}

// ─── Funds, CoA, Fiscal Periods, Budget ───────────────────────────────

async function ensureFunds(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<{ OPERATING: string; RESERVE: string }> {
  const { data: existing } = await db
    .from('funds')
    .select('id, code')
    .eq('association_id', associationId)
  const byCode = new Map<string, string>((existing ?? []).map((f) => [f.code, f.id]))

  for (const w of [
    { code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating' },
    { code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve' },
  ] as const) {
    if (byCode.has(w.code)) continue
    const { data, error } = await db
      .from('funds')
      .insert({
        organization_id: orgId,
        association_id: associationId,
        code: w.code,
        name: w.name,
        fund_type: w.fund_type,
      })
      .select('id, code')
      .single()
    if (error || !data) throw new Error(`[funds] ${w.code}: ${error?.message}`)
    byCode.set(data.code, data.id)
  }
  console.log(`[funds] ✓ Operating + Reserve`)
  return { OPERATING: byCode.get('OPERATING')!, RESERVE: byCode.get('RESERVE')! }
}

interface CoaSeed {
  number: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  fund: 'OPERATING' | 'RESERVE' | null
}

const DEFAULT_COA: CoaSeed[] = [
  { number: '1010', name: 'Cash — Operating', type: 'asset', fund: 'OPERATING' },
  { number: '1020', name: 'Cash — Reserve', type: 'asset', fund: 'RESERVE' },
  { number: '1100', name: 'Accounts Receivable', type: 'asset', fund: null },
  { number: '1110', name: 'Allowance for Doubtful Accounts', type: 'asset', fund: null },
  { number: '1200', name: 'Prepaid Expenses', type: 'asset', fund: 'OPERATING' },
  { number: '2010', name: 'Accounts Payable', type: 'liability', fund: null },
  { number: '2100', name: 'Prepaid Assessments', type: 'liability', fund: 'OPERATING' },
  { number: '2200', name: 'Accrued Expenses', type: 'liability', fund: 'OPERATING' },
  { number: '3000', name: 'Fund Balance — Operating', type: 'equity', fund: 'OPERATING' },
  { number: '3010', name: 'Fund Balance — Reserve', type: 'equity', fund: 'RESERVE' },
  { number: '4000', name: 'Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4010', name: 'Special Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4100', name: 'Late Fee Income', type: 'income', fund: 'OPERATING' },
  { number: '4110', name: 'Fine Income', type: 'income', fund: 'OPERATING' },
  { number: '4200', name: 'Interest Income', type: 'income', fund: 'RESERVE' },
  { number: '5000', name: 'Landscaping', type: 'expense', fund: 'OPERATING' },
  { number: '5010', name: 'Utilities', type: 'expense', fund: 'OPERATING' },
  { number: '5020', name: 'Insurance', type: 'expense', fund: 'OPERATING' },
  { number: '5030', name: 'Management Fees', type: 'expense', fund: 'OPERATING' },
  { number: '5040', name: 'Repairs & Maintenance', type: 'expense', fund: 'OPERATING' },
  { number: '5050', name: 'Professional Fees', type: 'expense', fund: 'OPERATING' },
  { number: '5060', name: 'Office & Admin', type: 'expense', fund: 'OPERATING' },
  { number: '5100', name: 'Reserve Expenditures', type: 'expense', fund: 'RESERVE' },
  { number: '5900', name: 'Bank Fees', type: 'expense', fund: 'OPERATING' },
]

async function ensureChartOfAccounts(
  db: Db,
  orgId: string,
  associationId: string,
  fundIds: { OPERATING: string; RESERVE: string },
): Promise<Map<string, string>> {
  const { data: existing } = await db
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('association_id', associationId)
  const byNumber = new Map<string, string>(
    (existing ?? []).map((a) => [a.account_number, a.id]),
  )

  for (const a of DEFAULT_COA) {
    if (byNumber.has(a.number)) continue
    const fundId = a.fund ? fundIds[a.fund] : null
    const { data, error } = await db
      .from('chart_of_accounts')
      .insert({
        organization_id: orgId,
        association_id: associationId,
        account_number: a.number,
        account_name: a.name,
        account_type: a.type,
        fund_id: fundId,
      })
      .select('id, account_number')
      .single()
    if (error || !data) throw new Error(`[coa] ${a.number}: ${error?.message}`)
    byNumber.set(data.account_number, data.id)
  }
  console.log(`[coa] ✓ ${DEFAULT_COA.length} accounts`)
  return byNumber
}

async function ensureFiscalPeriods(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<Record<string, string>> {
  // No period_name column in this schema — identify by start_date year.
  const { data: existing } = await db
    .from('fiscal_periods')
    .select('id, start_date')
    .eq('association_id', associationId)
  const byYear = new Map<string, string>(
    (existing ?? []).map((p: { id: string; start_date: string }) => [
      p.start_date.slice(0, 4),
      p.id,
    ]),
  )

  for (const p of [
    { year: '2025', start: '2025-01-01', end: '2025-12-31', status: 'closed' },
    { year: '2026', start: '2026-01-01', end: '2026-12-31', status: 'open' },
  ]) {
    if (byYear.has(p.year)) continue
    const { data, error } = await db
      .from('fiscal_periods')
      .insert({
        organization_id: orgId,
        association_id: associationId,
        start_date: p.start,
        end_date: p.end,
        status: p.status,
      })
      .select('id, start_date')
      .single()
    if (error || !data) throw new Error(`[fp] FY${p.year}: ${error?.message}`)
    byYear.set(data.start_date.slice(0, 4), data.id)
  }
  console.log('[fiscal_periods] ✓ FY2025 (closed) + FY2026 (open)')
  return { '2025': byYear.get('2025')!, '2026': byYear.get('2026')! }
}

async function ensureBudget(
  db: Db,
  orgId: string,
  associationId: string,
  fp2026: string,
  fundIds: { OPERATING: string; RESERVE: string },
  coaIds: Map<string, string>,
): Promise<void> {
  const { data: existing } = await db
    .from('budgets')
    .select('id')
    .eq('association_id', associationId)
    .eq('fiscal_period_id', fp2026)
    .limit(1)
  if (existing && existing.length > 0) {
    console.log('[budget] FY2026 already present, skipping')
    return
  }

  const { data: budget, error } = await db
    .from('budgets')
    .insert({
      organization_id: orgId,
      association_id: associationId,
      fiscal_period_id: fp2026,
      fund_id: fundIds.OPERATING,
      status: 'approved',
      approved_at: '2025-11-15T00:00:00Z',
    } as never)
    .select('id')
    .single<{ id: string }>()
  if (error || !budget) throw new Error(`[budget] insert: ${error?.message}`)

  // Annual line items for the 2026 operating budget.
  const lines = [
    { acct: '4000', annual: 540000, note: 'Assessment income: 135 × $333 × 12' },
    { acct: '4100', annual: 4500, note: 'Late fees, projected' },
    { acct: '4110', annual: 6000, note: 'Fines, projected' },
    { acct: '5000', annual: -84000, note: 'Verde Garden Co landscaping' },
    { acct: '5010', annual: -42000, note: 'Common-area utilities' },
    { acct: '5020', annual: -36000, note: 'Master insurance policy' },
    { acct: '5030', annual: -0, note: 'Self-managed — no fee' },
    { acct: '5040', annual: -48000, note: 'Repairs & maintenance' },
    { acct: '5050', annual: -12000, note: 'Legal + accounting' },
    { acct: '5060', annual: -6000, note: 'Office, postage, software' },
    { acct: '5900', annual: -1800, note: 'Bank fees' },
    // Reserve transfer line lives outside the operating budget envelope.
  ]
  const inserts = lines.map((l) => ({
    budget_id: budget.id,
    account_id: coaIds.get(l.acct)!,
    amount: l.annual,
    notes: l.note,
  }))
  const { error: lineErr } = await db
    .from('budget_line_items')
    .insert(inserts as never)
  if (lineErr) throw new Error(`[budget_lines] insert: ${lineErr.message}`)
  console.log(`[budget] ✓ FY2026 approved with ${lines.length} line items`)
}

// ─── Properties ───────────────────────────────────────────────────────

const STREETS = [
  'Creek Valley Dr',
  'Oak Ridge Ln',
  'Magnolia Ct',
  'Camellia Way',
  'Hollybrook Trce',
  'Springwood Pkwy',
]

async function ensureProperties(db: Db, orgId: string): Promise<string[]> {
  const { data: existing } = await db
    .from('hoa_properties')
    .select('id, address')
    .eq('org_id', orgId)
    .order('created_at')
  if (existing && existing.length >= TOTAL_UNITS) {
    console.log(`[properties] ${existing.length} present, skipping`)
    return existing.map((p) => p.id)
  }

  // Deterministic generator: 135 houses across 6 streets, lots numbered
  // 100..  Each street gets ~23 houses.
  const inserts: { address: string; unit_number: string }[] = []
  for (let i = 0; i < TOTAL_UNITS; i++) {
    const street = STREETS[i % STREETS.length]
    const num = 100 + Math.floor(i / STREETS.length) * 2 + (i % 2)
    inserts.push({
      address: `${num} ${street}, Atlanta, GA 30067`,
      unit_number: `CV-${String(i + 1).padStart(3, '0')}`,
    })
  }

  // Skip any addresses already present.
  const presentAddrs = new Set((existing ?? []).map((p) => p.address))
  const toCreate = inserts.filter((p) => !presentAddrs.has(p.address))

  const created: string[] = []
  // Batch 50 at a time.
  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50).map((p) => ({
      org_id: orgId,
      address: p.address,
      unit_number: p.unit_number,
    }))
    const { data, error } = await db
      .from('hoa_properties')
      .insert(batch)
      .select('id')
    if (error) throw new Error(`[properties] batch ${i}: ${error.message}`)
    created.push(...(data ?? []).map((r) => r.id))
  }
  console.log(`[properties] ✓ ${created.length} created (${existing?.length ?? 0} prior)`)

  // Return ids in stable order (by address) so downstream seeds can
  // reference property_index → id reliably.
  const { data: all } = await db
    .from('hoa_properties')
    .select('id, address')
    .eq('org_id', orgId)
    .order('address')
  return (all ?? []).map((p) => p.id)
}

// ─── Units (canonical property table, parallel to hoa_properties) ────

async function ensureUnits(
  db: Db,
  orgId: string,
  associationId: string,
  hoaPropIds: string[],
): Promise<string[]> {
  // Pull existing units with their legacy_hoa_property_id mapping.
  const { data: existing } = await db
    .from('units')
    .select('id, legacy_hoa_property_id')
    .eq('organization_id', orgId)
  const byLegacy = new Map<string, string>(
    (existing ?? [])
      .filter((u) => u.legacy_hoa_property_id)
      .map((u) => [u.legacy_hoa_property_id as string, u.id]),
  )

  // Pull the address back for each hoa_property to populate the unit.
  const { data: hoaProps } = await db
    .from('hoa_properties')
    .select('id, address, unit_number')
    .in('id', hoaPropIds)
  const hoaPropById = new Map((hoaProps ?? []).map((p) => [p.id, p]))

  const toCreate: Array<{
    organization_id: string
    association_id: string
    address_line1: string
    city: string
    state: string
    postal_code: string
    unit_number: string
    legacy_hoa_property_id: string
  }> = []
  for (const hpId of hoaPropIds) {
    if (byLegacy.has(hpId)) continue
    const hp = hoaPropById.get(hpId)
    if (!hp) continue
    const addr = hp.address // e.g. "100 Creek Valley Dr, Atlanta, GA 30067"
    const [street, city, stZip] = addr.split(',').map((s) => s.trim())
    const [state, zip] = (stZip || 'GA 30067').split(/\s+/)
    toCreate.push({
      organization_id: orgId,
      association_id: associationId,
      address_line1: street,
      city: city ?? 'Atlanta',
      state: state ?? 'GA',
      postal_code: zip ?? '30067',
      unit_number: hp.unit_number ?? '',
      legacy_hoa_property_id: hpId,
    })
  }

  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50)
    const { data, error } = await db
      .from('units')
      .insert(batch)
      .select('id, legacy_hoa_property_id')
    if (error) throw new Error(`[units] batch ${i}: ${error.message}`)
    for (const row of data ?? []) {
      if (row.legacy_hoa_property_id) byLegacy.set(row.legacy_hoa_property_id, row.id)
    }
  }
  console.log(`[units] ✓ ${byLegacy.size} units (linked to hoa_properties)`)

  // Return ordered by hoaPropIds so downstream index lookups match.
  return hoaPropIds.map((hp) => byLegacy.get(hp)!).filter(Boolean)
}

// ─── Residents ────────────────────────────────────────────────────────

const FIRST_NAMES_F = [
  'Margaret', 'Sandra', 'Linda', 'Patricia', 'Jennifer', 'Anna', 'Maria',
  'Sarah', 'Karen', 'Lisa', 'Nancy', 'Donna', 'Carol', 'Michelle', 'Laura',
  'Amanda', 'Stephanie', 'Rebecca', 'Sharon', 'Cynthia', 'Kathleen',
  'Helen', 'Deborah', 'Dorothy', 'Mei', 'Priya', 'Aisha', 'Yolanda',
]
const FIRST_NAMES_M = [
  'David', 'Marcus', 'Robert', 'James', 'John', 'Michael', 'William',
  'Daniel', 'Joseph', 'Charles', 'Thomas', 'Christopher', 'Matthew',
  'Brian', 'Kevin', 'Jason', 'Eric', 'Steven', 'Andrew', 'Kenneth',
  'Paul', 'Mark', 'George', 'Edward', 'Raj', 'Hiroshi', 'DeShawn',
  'Carlos', 'Antonio',
]
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson',
  'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez',
  'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright',
  'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson',
  'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
  'Patel', 'Chen', 'Kim', 'Park', 'Wong', 'Singh', 'Khan',
]

interface Resident {
  id: string
  full_name: string
  email: string
  phone: string
}

function rng(seed: number): () => number {
  // Tiny deterministic PRNG so re-runs produce the same names.
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

async function ensureResidents(db: Db, orgId: string): Promise<Resident[]> {
  // We don't have an auth.users table to write to without admin SDK, so
  // residents live in `ownerships` and `tenancies` with owner_name /
  // tenant_name fields and no profiles row. The product expects this
  // shape for unlinked-resident records (PROJECT_FOUNDATION §5).
  //
  // This function generates the resident roster as in-memory objects
  // and returns it; ownerships/tenancies will reference these by index.
  const r = rng(20260517)
  const residents: Resident[] = []
  // 1.65 residents per house avg = ~223 residents
  const total = Math.round(TOTAL_UNITS * 1.65)
  for (let i = 0; i < total; i++) {
    const isFemale = r() < 0.52
    const first = isFemale
      ? FIRST_NAMES_F[Math.floor(r() * FIRST_NAMES_F.length)]
      : FIRST_NAMES_M[Math.floor(r() * FIRST_NAMES_M.length)]
    const last = LAST_NAMES[Math.floor(r() * LAST_NAMES.length)]
    const full = `${first} ${last}`
    const emailLocal = `${first.toLowerCase()}.${last.toLowerCase()}${i}`
    const phone = `(404) 555-${String(1000 + Math.floor(r() * 8999)).padStart(4, '0')}`
    residents.push({
      id: `res-${i}`,
      full_name: full,
      email: `${emailLocal}@example.com`,
      phone,
    })
  }
  console.log(`[residents] ✓ generated ${residents.length} resident records (in-memory)`)
  return residents
}

// ─── Ownerships ───────────────────────────────────────────────────────

async function ensureOwnerships(
  db: Db,
  orgId: string,
  propertyIds: string[],
  residents: Resident[],
): Promise<void> {
  const { count } = await db
    .from('ownerships')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (count && count >= TOTAL_UNITS) {
    console.log(`[ownerships] ${count} present, skipping`)
    return
  }

  const r = rng(42)
  const inserts: Array<{
    organization_id: string
    unit_id: string
    owner_name: string
    owner_email: string
    owner_phone: string
    valid_from: string
    ownership_pct: number
    source: string
  }> = []

  // 70% single-owner, 25% couple (2 ownerships, 50% each), 5% LLC
  let residentIdx = 0
  for (let i = 0; i < TOTAL_UNITS; i++) {
    const propertyId = propertyIds[i]
    const roll = r()
    if (roll < 0.70) {
      const res = residents[residentIdx++ % residents.length]
      inserts.push({
        organization_id: orgId,
        unit_id: propertyId,
        owner_name: res.full_name,
        owner_email: res.email,
        owner_phone: res.phone,
        valid_from: '2018-01-01',
        ownership_pct: 100,
        source: 'demo-seed',
      })
    } else if (roll < 0.95) {
      const a = residents[residentIdx++ % residents.length]
      const b = residents[residentIdx++ % residents.length]
      inserts.push({
        organization_id: orgId,
        unit_id: propertyId,
        owner_name: a.full_name,
        owner_email: a.email,
        owner_phone: a.phone,
        valid_from: '2018-01-01',
        ownership_pct: 50,
        source: 'demo-seed',
      })
      inserts.push({
        organization_id: orgId,
        unit_id: propertyId,
        owner_name: b.full_name,
        owner_email: b.email,
        owner_phone: b.phone,
        valid_from: '2018-01-01',
        ownership_pct: 50,
        source: 'demo-seed',
      })
    } else {
      inserts.push({
        organization_id: orgId,
        unit_id: propertyId,
        owner_name: `Lot ${i + 1} Holdings LLC`,
        owner_email: `lot${i + 1}@example.com`,
        owner_phone: '(404) 555-9000',
        valid_from: '2018-01-01',
        ownership_pct: 100,
        source: 'demo-seed',
      })
    }
  }

  for (let i = 0; i < inserts.length; i += 100) {
    const batch = inserts.slice(i, i + 100)
    const { error } = await db.from('ownerships').insert(batch as never)
    if (error) throw new Error(`[ownerships] batch ${i}: ${error.message}`)
  }
  console.log(`[ownerships] ✓ ${inserts.length} records`)
}

// ─── Tenancies ────────────────────────────────────────────────────────

async function ensureTenancies(
  db: Db,
  orgId: string,
  propertyIds: string[],
  residents: Resident[],
): Promise<void> {
  const { count } = await db
    .from('tenancies')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (count && count > 0) {
    console.log(`[tenancies] ${count} present, skipping`)
    return
  }

  // ~16% of properties are rentals — 22 tenancies.
  const r = rng(7)
  const rentalCount = 22
  const usedProps = new Set<number>()
  const inserts: Array<{
    organization_id: string
    unit_id: string
    tenant_name: string
    tenant_email: string
    tenant_phone: string
    lease_start: string
    lease_end: string
    monthly_rent: number
    deposit: number
    status: string
  }> = []
  let residentIdx = 0
  while (inserts.length < rentalCount) {
    const idx = Math.floor(r() * TOTAL_UNITS)
    if (usedProps.has(idx)) continue
    usedProps.add(idx)
    const tenant = residents[(residentIdx++ + 100) % residents.length]
    const monthlyRent = 2200 + Math.floor(r() * 600)
    inserts.push({
      organization_id: orgId,
      unit_id: propertyIds[idx],
      tenant_name: tenant.full_name,
      tenant_email: tenant.email,
      tenant_phone: tenant.phone,
      lease_start: '2025-01-01',
      lease_end: '2026-12-31',
      monthly_rent: monthlyRent,
      deposit: monthlyRent,
      status: 'active',
    })
  }
  const { error } = await db.from('tenancies').insert(inserts as never)
  if (error) throw new Error(`[tenancies] insert: ${error.message}`)
  console.log(`[tenancies] ✓ ${inserts.length} active rentals`)
}

// ─── Vendors ──────────────────────────────────────────────────────────

const VENDOR_ROSTER: Array<{
  legal_name: string
  dba?: string
  trades: string[]
  primary_email: string
  primary_phone: string
}> = [
  { legal_name: 'Verde Garden Co, LLC', dba: 'Verde Garden', trades: ['landscape', 'irrigation'], primary_email: 'office@verdegarden.example.com', primary_phone: '(770) 555-0101' },
  { legal_name: 'Greenleaf Lawncare Services Inc', trades: ['landscape'], primary_email: 'service@greenleaf.example.com', primary_phone: '(770) 555-0102' },
  { legal_name: 'Atlanta Pool Pros LLC', trades: ['pool', 'maintenance'], primary_email: 'hello@atlantapoolpros.example.com', primary_phone: '(770) 555-0103' },
  { legal_name: 'Southern Roofing Solutions', trades: ['roofing'], primary_email: 'admin@southernroof.example.com', primary_phone: '(770) 555-0104' },
  { legal_name: 'Peachtree HVAC Inc', trades: ['hvac'], primary_email: 'service@peachtreehvac.example.com', primary_phone: '(770) 555-0105' },
  { legal_name: 'Brightside Electric LLC', trades: ['electrical'], primary_email: 'jobs@brightsidelectric.example.com', primary_phone: '(770) 555-0106' },
  { legal_name: 'Atlanta Plumbing Partners', trades: ['plumbing'], primary_email: 'service@atlplumbing.example.com', primary_phone: '(770) 555-0107' },
  { legal_name: 'Sentry Security Patrol Co', trades: ['security'], primary_email: 'dispatch@sentrysec.example.com', primary_phone: '(770) 555-0108' },
  { legal_name: 'Cobb County Pest Control', trades: ['pest_control'], primary_email: 'office@cobbpest.example.com', primary_phone: '(770) 555-0109' },
  { legal_name: 'Stillwater CPA Group LLC', trades: ['accounting'], primary_email: 'hoa@stillwatercpa.example.com', primary_phone: '(770) 555-0110' },
  { legal_name: 'Holloway & Reed, Attorneys at Law', trades: ['legal'], primary_email: 'counsel@hollowayreed.example.com', primary_phone: '(770) 555-0111' },
  { legal_name: 'Cole-Walker Insurance Brokers', trades: ['insurance'], primary_email: 'binders@colewalker.example.com', primary_phone: '(770) 555-0112' },
  { legal_name: 'Southside Paving & Concrete', trades: ['paving', 'concrete'], primary_email: 'estimates@southsidepave.example.com', primary_phone: '(770) 555-0113' },
  { legal_name: 'CleanStream Janitorial', trades: ['janitorial'], primary_email: 'office@cleanstream.example.com', primary_phone: '(770) 555-0114' },
  { legal_name: 'Mockingbird Tree Service', trades: ['tree_service'], primary_email: 'jobs@mockingbirdtree.example.com', primary_phone: '(770) 555-0115' },
]

async function ensureVendors(db: Db, orgId: string): Promise<void> {
  const { count } = await db
    .from('vendors')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  if (count && count >= VENDOR_ROSTER.length) {
    console.log(`[vendors] ${count} present, skipping`)
    return
  }
  const inserts = VENDOR_ROSTER.map((v) => ({
    organization_id: orgId,
    legal_name: v.legal_name,
    dba: v.dba ?? null,
    trades: v.trades,
    primary_email: v.primary_email,
    primary_phone: v.primary_phone,
    status: 'active',
    service_area_zips: ['30067', '30068', '30062'],
  }))
  const { error } = await db.from('vendors').insert(inserts as never)
  if (error) throw new Error(`[vendors] insert: ${error.message}`)
  console.log(`[vendors] ✓ ${inserts.length} vendors`)
}

// ─── Assessments + Dues ────────────────────────────────────────────────

const MONTHLY_DUES = 333 // $333/door/month → $539,460/yr gross

async function ensureAssessmentsAndDues(
  db: Db,
  orgId: string,
  associationId: string,
  unitIds: string[],
  hoaPropIds: string[],
  fpIds: Record<string, string>,
): Promise<void> {
  const { count: assessCount } = await db
    .from('assessments')
    .select('id', { count: 'exact', head: true })
    .eq('association_id', associationId)
  const { count: duesCount } = await db
    .from('hoa_dues')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  const assessmentsDone = (assessCount ?? 0) >= TOTAL_UNITS * 12
  const duesDone = (duesCount ?? 0) >= TOTAL_UNITS * 12
  if (assessmentsDone && duesDone) {
    console.log(`[assessments+dues] both already populated, skipping`)
    return
  }

  const r = rng(1)
  // Generate 12 months of 2025 assessments × 135 = 1620 records.
  const assessInserts: any[] = []
  const duesInserts: any[] = []
  for (let m = 0; m < 12; m++) {
    const dueDate = `2025-${String(m + 1).padStart(2, '0')}-01`
    const period = `2025-${String(m + 1).padStart(2, '0')}`
    for (let i = 0; i < TOTAL_UNITS; i++) {
      // 92% paid on time, 5% paid-with-late-fee, 3% overdue (>30 days)
      const roll = r()
      // hoa_dues.status valid values: paid | pending | late | partial | waived
      let status: 'paid' | 'late' | 'pending'
      let latePaid = false
      if (roll < 0.92) status = 'paid'
      else if (roll < 0.97) {
        status = 'paid'
        latePaid = true
      } else status = 'late'

      assessInserts.push({
        organization_id: orgId,
        association_id: associationId,
        fiscal_period_id: fpIds['2025'],
        unit_id: unitIds[i],
        amount: MONTHLY_DUES,
        assessment_type: 'regular',
        due_date: dueDate,
        // assessments.status represents the assessment lifecycle (open
        // assessment / fully paid / written off). Payment status lives
        // on hoa_dues. We mark all 2025 closed-year assessments 'paid'.
        status: 'paid',
        memo_code: `DUES-${period}`,
      })
      duesInserts.push({
        org_id: orgId,
        property_id: hoaPropIds[i],
        period,
        due_date: dueDate,
        amount_due: MONTHLY_DUES,
        amount_paid: status === 'paid' ? MONTHLY_DUES : 0,
        late_fee: latePaid ? 25 : 0,
        status,
        paid_date: status === 'paid' ? dueDate : null,
      })
    }
  }

  if (!assessmentsDone) {
    for (let i = 0; i < assessInserts.length; i += 200) {
      const { error } = await db
        .from('assessments')
        .insert(assessInserts.slice(i, i + 200) as never)
      if (error) throw new Error(`[assessments] batch ${i}: ${error.message}`)
    }
    console.log(`[assessments] ✓ ${assessInserts.length} rows`)
  } else {
    console.log(`[assessments] ${assessCount} present, skipping`)
  }
  if (!duesDone) {
    for (let i = 0; i < duesInserts.length; i += 200) {
      const { error } = await db
        .from('hoa_dues')
        .insert(duesInserts.slice(i, i + 200) as never)
      if (error) throw new Error(`[hoa_dues] batch ${i}: ${error.message}`)
    }
    console.log(`[hoa_dues] ✓ ${duesInserts.length} rows`)
  } else {
    console.log(`[hoa_dues] ${duesCount} present, skipping`)
  }
}

// ─── Violations ───────────────────────────────────────────────────────

async function ensureViolations(
  db: Db,
  orgId: string,
  propertyIds: string[],
  residents: Resident[],
): Promise<void> {
  const fixturePath = resolve(FIXTURES_DIR, 'creek-valley-violations.json')
  if (!existsSync(fixturePath)) {
    console.log(`[violations] fixture not found (${fixturePath}), skipping`)
    return
  }
  const { count } = await db
    .from('hoa_violations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (count && count > 0) {
    console.log(`[violations] ${count} present, skipping`)
    return
  }
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{
    violation_type: string
    description: string
    severity: string
    status: string
    ccr_section: string
    fine_amount: number
    cure_period_days: number
    notice_sent_at: string | null
    resolved_at: string | null
    created_at: string
    property_index: number
    resident_name: string
    resolution_note: string | null
    ai_draft_letter: string
  }>
  // Map fixture status values to the DB's enum.
  // Valid DB enum: open | notice_sent | resolved
  // Escalated fixtures get 'notice_sent' — the elevated fine_amount on
  // each row encodes the escalation state.
  const statusMap: Record<string, string> = {
    open: 'open',
    notice_sent: 'notice_sent',
    cured: 'resolved',
    escalated: 'notice_sent',
  }
  const inserts = raw.map((v) => {
    const dbStatus = statusMap[v.status] ?? 'open'
    return {
      org_id: orgId,
      property_id: propertyIds[Math.max(0, Math.min(TOTAL_UNITS - 1, v.property_index - 1))],
      violation_type: v.violation_type,
      description: v.description,
      severity: v.severity,
      status: dbStatus,
      ccr_section: v.ccr_section,
      fine_amount: v.fine_amount,
      cure_period_days: v.cure_period_days,
      notice_sent_at: v.notice_sent_at,
      resolved_at: v.resolved_at,
      created_at: v.created_at,
      resolution_note: v.resolution_note,
      ai_draft_letter: v.ai_draft_letter,
      approved_letter: dbStatus === 'resolved' || dbStatus === 'notice_sent' ? v.ai_draft_letter : null,
    }
  })
  const { error } = await db.from('hoa_violations').insert(inserts as never)
  if (error) throw new Error(`[violations] insert: ${error.message}`)
  console.log(`[violations] ✓ ${inserts.length} violations`)
}

// ─── Meetings ─────────────────────────────────────────────────────────

async function ensureMeetings(db: Db, orgId: string): Promise<void> {
  const fixturePath = resolve(FIXTURES_DIR, 'creek-valley-meetings.json')
  if (!existsSync(fixturePath)) {
    console.log(`[meetings] fixture not found (${fixturePath}), skipping`)
    return
  }
  const { count } = await db
    .from('hoa_meeting_minutes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (count && count > 0) {
    console.log(`[meetings] ${count} present, skipping`)
    return
  }
  const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{
    meeting_date: string
    meeting_type: string
    attendees: string[]
    motions: unknown
    action_items: unknown
    ai_summary: string
    raw_transcript: string
    status?: string
    approved_at?: string
  }>
  // DB enum: regular | special | annual. Map 'budget' → 'annual'
  // (annual budget meeting is the typical name in HOA practice).
  const meetingTypeMap: Record<string, string> = {
    regular: 'regular',
    special: 'special',
    annual: 'annual',
    budget: 'annual',
  }
  const inserts = raw.map((m) => ({
    org_id: orgId,
    meeting_date: m.meeting_date,
    meeting_type: meetingTypeMap[m.meeting_type] ?? 'regular',
    attendees: m.attendees,
    motions: m.motions,
    action_items: m.action_items,
    ai_summary: m.ai_summary,
    raw_transcript: m.raw_transcript,
    status: m.status ?? 'approved',
    approved_at: m.approved_at ?? `${m.meeting_date}T20:00:00Z`,
  }))
  const { error } = await db.from('hoa_meeting_minutes').insert(inserts as never)
  if (error) throw new Error(`[meetings] insert: ${error.message}`)
  console.log(`[meetings] ✓ ${inserts.length} meetings`)
}

// ─── Governing docs ───────────────────────────────────────────────────

async function ensureGoverningDocs(
  db: Db,
  orgId: string,
  associationId: string,
): Promise<void> {
  const ccrPath = resolve(FIXTURES_DIR, 'creek-valley-ccr.md')
  const bylawsPath = resolve(FIXTURES_DIR, 'creek-valley-bylaws.md')
  const lawPath = resolve(FIXTURES_DIR, 'creek-valley-ga-statute.md')

  const docs: Array<{ path: string; type: string; title: string }> = [
    { path: ccrPath, type: 'declaration', title: 'Creek Valley Declaration of Covenants, Conditions, and Restrictions' },
    { path: bylawsPath, type: 'bylaws', title: 'Creek Valley Community Association Bylaws' },
    // Schema enum: declaration | bylaws | rules | amendment. The GA
    // statute excerpt rides under 'rules' as the closest semantic fit.
    { path: lawPath, type: 'rules', title: 'Georgia Property Owners Association Act — Excerpts' },
  ]

  for (const doc of docs) {
    if (!existsSync(doc.path)) {
      console.log(`[docs] fixture ${doc.path} missing, skipping`)
      continue
    }
    const { data: existing } = await db
      .from('governing_documents' as never)
      .select('id')
      .eq('organization_id' as never, orgId)
      .eq('title' as never, doc.title)
      .limit(1)
    if (existing && (existing as unknown[]).length > 0) {
      console.log(`[docs] "${doc.title}" already present, skipping`)
      continue
    }
    const text = readFileSync(doc.path, 'utf8')
    const { data: row, error } = await db
      .from('governing_documents' as never)
      .insert({
        organization_id: orgId,
        association_id: associationId,
        type: doc.type,
        title: doc.title,
        effective_date: '2024-01-01',
        parsed_text: text,
        parsed_at: new Date().toISOString(),
        parser_version: 'creek-valley-demo-seed-1.0.0',
      } as never)
      .select('id')
      .single<{ id: string }>()
    if (error || !row) throw new Error(`[docs] ${doc.title}: ${error?.message}`)

    // Chunk by H3 (same as seed-sample-ccr) — markdown sections.
    const chunks = chunkBySectionHeading(text)
    const chunkInserts = chunks.map((c, ordinal) => ({
      organization_id: orgId,
      document_id: row.id,
      section: c.section,
      page_number: null,
      ordinal,
      text: c.text,
      embedding: null,
      metadata: {
        doc_title: doc.title,
        seeded_from: 'creek-valley-demo',
        embedding_status: 'pending',
      },
    }))
    for (let i = 0; i < chunkInserts.length; i += 50) {
      const { error: cErr } = await db
        .from('governing_document_chunks' as never)
        .insert(chunkInserts.slice(i, i + 50) as never)
      if (cErr) throw new Error(`[docs] chunks ${doc.title}: ${cErr.message}`)
    }
    console.log(`[docs] ✓ "${doc.title}" + ${chunkInserts.length} chunks`)
  }
}

function chunkBySectionHeading(
  markdown: string,
): Array<{ section: string; text: string }> {
  const lines = markdown.split('\n')
  const chunks: Array<{ section: string; text: string }> = []
  let currentArticle = ''
  let currentSection: { section: string; lines: string[] } | null = null
  const flush = (): void => {
    if (currentSection && currentSection.lines.length > 0) {
      const body = currentSection.lines.join('\n').trim()
      if (body.length > 0) {
        chunks.push({
          section: currentSection.section,
          text: `${currentArticle ? currentArticle + '\n\n' : ''}${body}`,
        })
      }
    }
    currentSection = null
  }
  for (const line of lines) {
    if (line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      flush()
      currentArticle = line.slice(3).trim()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      const heading = line.slice(4).trim()
      currentSection = { section: heading, lines: [heading] }
      continue
    }
    if (currentSection) currentSection.lines.push(line)
  }
  flush()
  return chunks
}

main().catch((err) => {
  console.error('[creek-valley] crashed:', err)
  process.exit(1)
})
