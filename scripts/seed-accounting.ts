/**
 * scripts/seed-accounting.ts
 *
 * Idempotent accounting bootstrap for one HOA association. Creates:
 *   - 2 funds: OPERATING, RESERVE
 *   - A standard ~20-account chart of accounts (see DEFAULT_COA below)
 *   - An open fiscal period covering the current calendar year
 *
 * Re-running for the same association is safe — each table has a unique
 * constraint that matches the seed key, so we use UPSERT-style "select
 * then insert if missing" on every row.
 *
 * Usage (env loader handles .env.local automatically):
 *
 *   pnpm exec tsx scripts/seed-accounting.ts                  # all HOA orgs
 *   SEED_ORG_NAME="Madison Park HOA" pnpm exec tsx \
 *     scripts/seed-accounting.ts                              # one org
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) — bypasses
 * RLS so the script can read/write across all associations cleanly.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[seed-accounting] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

type Db = SupabaseClient<Database>

// ─── Default chart of accounts (per spec §13 / standard HOA practice) ─
// Account numbers follow 1xxx assets / 2xxx liabilities / 3xxx equity /
// 4xxx income / 5xxx expenses. Each row says which fund it belongs to —
// `null` means the account is shared (e.g. AR isn't fund-specific until
// a payment lands), and the JE composer will require an explicit fund
// when a line targets it.

interface CoaSeed {
  number: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  fund: 'OPERATING' | 'RESERVE' | null
  description?: string
}

const DEFAULT_COA: CoaSeed[] = [
  // Assets
  { number: '1010', name: 'Cash — Operating', type: 'asset', fund: 'OPERATING' },
  { number: '1020', name: 'Cash — Reserve', type: 'asset', fund: 'RESERVE' },
  { number: '1100', name: 'Accounts Receivable', type: 'asset', fund: null,
    description: 'Homeowner assessments not yet collected.' },
  { number: '1110', name: 'Allowance for Doubtful Accounts', type: 'asset', fund: null },
  { number: '1200', name: 'Prepaid Expenses', type: 'asset', fund: 'OPERATING' },
  // Liabilities
  { number: '2010', name: 'Accounts Payable', type: 'liability', fund: null,
    description: 'Vendor invoices received and approved, not yet paid.' },
  { number: '2100', name: 'Prepaid Assessments', type: 'liability', fund: 'OPERATING',
    description: 'Homeowner payments received before the assessment was billed.' },
  { number: '2200', name: 'Accrued Expenses', type: 'liability', fund: 'OPERATING' },
  // Equity
  { number: '3000', name: 'Fund Balance — Operating', type: 'equity', fund: 'OPERATING' },
  { number: '3010', name: 'Fund Balance — Reserve', type: 'equity', fund: 'RESERVE' },
  // Income
  { number: '4000', name: 'Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4010', name: 'Special Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4100', name: 'Late Fee Income', type: 'income', fund: 'OPERATING' },
  { number: '4110', name: 'Fine Income', type: 'income', fund: 'OPERATING' },
  { number: '4200', name: 'Interest Income', type: 'income', fund: 'RESERVE' },
  { number: '4900', name: 'Other Income', type: 'income', fund: 'OPERATING' },
  // Expenses
  { number: '5000', name: 'Landscaping', type: 'expense', fund: 'OPERATING' },
  { number: '5010', name: 'Utilities', type: 'expense', fund: 'OPERATING' },
  { number: '5020', name: 'Insurance', type: 'expense', fund: 'OPERATING' },
  { number: '5030', name: 'Management Fees', type: 'expense', fund: 'OPERATING' },
  { number: '5040', name: 'Repairs & Maintenance', type: 'expense', fund: 'OPERATING' },
  { number: '5050', name: 'Professional Fees (Legal/Accounting)', type: 'expense', fund: 'OPERATING' },
  { number: '5060', name: 'Office & Admin', type: 'expense', fund: 'OPERATING' },
  { number: '5100', name: 'Reserve Expenditures', type: 'expense', fund: 'RESERVE' },
  { number: '5900', name: 'Bank Fees', type: 'expense', fund: 'OPERATING' },
]

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const targetOrgName = process.env.SEED_ORG_NAME

  // Find every HOA association the seed should touch.
  const { data: assocs, error: assocErr } = await db
    .from('associations')
    .select('id, name, organization_id, orgs:organization_id(name, hub_type)')
    .order('created_at', { ascending: true })

  if (assocErr) {
    console.error('[seed-accounting] Failed to read associations:', assocErr.message)
    process.exit(1)
  }

  const candidates = (assocs ?? []).filter((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetOrgName && org.name !== targetOrgName) return false
    return true
  })

  if (candidates.length === 0) {
    console.error(
      `[seed-accounting] No matching HOA associations found${
        targetOrgName ? ` for SEED_ORG_NAME="${targetOrgName}"` : ''
      }.`,
    )
    process.exit(1)
  }

  console.log(`[seed-accounting] Seeding ${candidates.length} association(s)`)

  for (const assoc of candidates) {
    const org = assoc.orgs as { name: string }
    console.log(`\n[seed-accounting] ── ${org.name} / ${assoc.name} (${assoc.id})`)
    await seedAssociation(db, {
      organizationId: assoc.organization_id,
      associationId: assoc.id,
    })
  }

  console.log('\n[seed-accounting] ✅ Done.')
}

async function seedAssociation(
  db: Db,
  input: { organizationId: string; associationId: string },
): Promise<void> {
  const fundIds = await seedFunds(db, input)
  await seedCoa(db, input, fundIds)
  await seedFiscalPeriod(db, input)
}

async function seedFunds(
  db: Db,
  input: { organizationId: string; associationId: string },
): Promise<{ OPERATING: string; RESERVE: string }> {
  const { data: existing } = await db
    .from('funds')
    .select('id, code')
    .eq('association_id', input.associationId)

  const byCode = new Map<string, string>(
    (existing ?? []).map((f) => [f.code, f.id]),
  )

  const want: { code: string; name: string; fund_type: string }[] = [
    { code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating' },
    { code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve' },
  ]

  for (const w of want) {
    if (byCode.has(w.code)) {
      console.log(`  fund ${w.code} already present`)
      continue
    }
    const { data, error } = await db
      .from('funds')
      .insert({
        organization_id: input.organizationId,
        association_id: input.associationId,
        code: w.code,
        name: w.name,
        fund_type: w.fund_type,
      })
      .select('id, code')
      .single()
    if (error || !data) {
      throw new Error(`failed to insert fund ${w.code}: ${error?.message}`)
    }
    byCode.set(data.code, data.id)
    console.log(`  + fund ${w.code}`)
  }

  return {
    OPERATING: byCode.get('OPERATING')!,
    RESERVE: byCode.get('RESERVE')!,
  }
}

async function seedCoa(
  db: Db,
  input: { organizationId: string; associationId: string },
  fundIds: { OPERATING: string; RESERVE: string },
): Promise<void> {
  const { data: existing } = await db
    .from('chart_of_accounts')
    .select('account_number')
    .eq('association_id', input.associationId)

  const have = new Set((existing ?? []).map((r) => r.account_number))

  let added = 0
  for (const seed of DEFAULT_COA) {
    if (have.has(seed.number)) continue
    const { error } = await db.from('chart_of_accounts').insert({
      organization_id: input.organizationId,
      association_id: input.associationId,
      account_number: seed.number,
      account_name: seed.name,
      account_type: seed.type,
      fund_id: seed.fund ? fundIds[seed.fund] : null,
      description: seed.description ?? null,
    })
    if (error) {
      throw new Error(
        `failed to insert account ${seed.number} ${seed.name}: ${error.message}`,
      )
    }
    added += 1
  }
  console.log(`  COA: ${added} added, ${have.size} already present`)
}

async function seedFiscalPeriod(
  db: Db,
  input: { organizationId: string; associationId: string },
): Promise<void> {
  const year = new Date().getFullYear()
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data: existing } = await db
    .from('fiscal_periods')
    .select('id, status')
    .eq('association_id', input.associationId)
    .eq('start_date', startDate)
    .eq('end_date', endDate)
    .maybeSingle()

  if (existing) {
    console.log(`  fiscal_period ${year} already present (${existing.status})`)
    return
  }

  const { error } = await db.from('fiscal_periods').insert({
    organization_id: input.organizationId,
    association_id: input.associationId,
    start_date: startDate,
    end_date: endDate,
    status: 'open',
  })
  if (error) {
    throw new Error(`failed to create fiscal_period ${year}: ${error.message}`)
  }
  console.log(`  + fiscal_period ${startDate} → ${endDate} (open)`)
}

main().catch((err) => {
  console.error('[seed-accounting] crashed:', err)
  process.exit(1)
})
