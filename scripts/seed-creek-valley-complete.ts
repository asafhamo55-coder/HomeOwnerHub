/**
 * scripts/seed-creek-valley-complete.ts
 *
 * Fills in EVERY gap in the Creek Valley HOA (Demo) tenant so the demo
 * app looks fully populated end-to-end. Builds on top of seed-creek-
 * valley-demo.ts (which creates the org/association/properties/etc.).
 *
 * What this script adds on top:
 *   - UPDATE hoa_properties to denormalize owner contact from ownerships
 *   - UPDATE units with bedrooms/bathrooms/sqft/lot_number
 *   - UPDATE vendors with ein/address/notes
 *   - UPDATE chart_of_accounts with descriptions
 *   - UPDATE fiscal_periods FY2025 with closed_at
 *   - INSERT 2 bank_accounts (Operating + Reserve)
 *   - INSERT journal_entries + ledger_entries for FY2025 (12 months of
 *     assessment income + 12 months of recurring expenses + 4 quarterly
 *     reserve transfers) — all balanced double-entry, posted via the
 *     postJournalEntry helper so the validate_je_balances trigger is
 *     satisfied
 *   - INSERT bank_transactions matching the JEs (for reconciliation
 *     demos)
 *   - INSERT invoices + payments for ~40 vendor invoices over the year
 *   - INSERT payment_methods (ACH for 40 sample homeowners)
 *   - INSERT hoa_documents (newsletters, annual report, reserve study)
 *   - INSERT recurring_journal_entries (2 templates)
 *
 * Idempotent — each section checks for existing rows.
 *
 *   pnpm exec tsx scripts/seed-creek-valley-complete.ts
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { postJournalEntry } from '../packages/db/src/accounting/post-journal-entry'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[complete] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

const ORG_ID = '36a5dabf-98cc-49a8-b91e-92828d431267'
const ASSOC_ID = '2877bdee-f236-4e23-9065-cec02d5b936d'

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('[complete] Starting completion pass for Creek Valley HOA (Demo)…')

  await fillVendorFields(db)
  await fillChartOfAccountsDescriptions(db)
  await fillFiscalPeriodCloseDate(db)
  await fillHoaPropertyOwners(db)
  await fillUnitDetails(db)

  const bankIds = await seedBankAccounts(db)
  const jeContext = await loadAccountingContext(db)
  await seedJournalEntries(db, jeContext, bankIds)
  await seedInvoicesAndPayments(db, jeContext)
  await seedPaymentMethods(db)
  await seedBankTransactions(db, bankIds)
  await seedHoaDocuments(db)
  await seedRecurringJournalEntries(db, jeContext)

  console.log('\n[complete] ✅ Done.')
}

// ─── Field fills ─────────────────────────────────────────────────────

async function fillVendorFields(db: Db): Promise<void> {
  const { data: vendors } = await db
    .from('vendors')
    .select('id, legal_name, trades, ein, address, notes')
    .eq('organization_id', ORG_ID)
  if (!vendors) return

  const updates: Array<Promise<unknown>> = []
  let i = 0
  for (const v of vendors) {
    if (v.ein && v.address && v.notes) continue
    const ein = `${30 + (i % 70)}-${String(1000000 + i * 137).slice(-7)}`
    const address = {
      line1: `${100 + i * 25} Industrial Pkwy`,
      city: ['Marietta', 'Smyrna', 'Roswell', 'Kennesaw'][i % 4],
      state: 'GA',
      postal_code: ['30067', '30068', '30062', '30144'][i % 4],
    }
    const notes = noteFor(v.legal_name, v.trades ?? [])
    updates.push(
      db
        .from('vendors')
        .update({ ein, address, notes })
        .eq('id', v.id),
    )
    i++
  }
  await Promise.all(updates)
  console.log(`[vendors] ✓ filled ${updates.length} rows (ein, address, notes)`)
}

function noteFor(name: string, trades: string[]): string {
  const t = trades[0] ?? 'service'
  return `Active Creek Valley vendor since 2023. Primary trade: ${t}. W-9 on file. Net 30 terms. Approved by board action — see meeting minutes for award details.`
}

async function fillChartOfAccountsDescriptions(db: Db): Promise<void> {
  const descriptions: Record<string, string> = {
    '1010': 'Operating fund checking account at Truist Bank. Day-to-day expenses, assessment receipts.',
    '1020': 'Reserve fund money-market account at Truist Bank. Long-term capital reserves per the reserve study.',
    '1100': 'Homeowner assessments billed but not yet collected.',
    '1110': 'Estimated uncollectible assessments — non-cash reduction of AR.',
    '1200': 'Prepaid insurance and other prepaid expenses.',
    '2010': 'Vendor invoices received and approved, not yet paid.',
    '2100': 'Homeowner payments received before the assessment was billed.',
    '2200': 'Estimated expenses incurred but not yet invoiced.',
    '3000': 'Cumulative operating fund equity since association inception.',
    '3010': 'Cumulative reserve fund equity since association inception.',
    '4000': 'Monthly assessment billings — primary revenue source.',
    '4010': 'One-time special assessments levied by board action.',
    '4100': 'Fees on late dues per CC&R §7.3 — $25/month.',
    '4110': 'Covenant violation fines per the published fine schedule.',
    '4200': 'Bank interest earned on reserve fund balances.',
    '5000': 'Verde Garden Co — landscape contract, $4,850/mo.',
    '5010': 'Common-area utilities — water, electric, gas.',
    '5020': 'Master insurance policy — property + general liability + D&O.',
    '5030': 'Self-managed in v1 — no third-party management fees.',
    '5040': 'Repairs to clubhouse, pool, common-area buildings.',
    '5050': 'Holloway & Reed (legal) + Stillwater CPA (accounting).',
    '5060': 'Postage, printing, software (Ledger app subscription), supplies.',
    '5100': 'Major capital expenditures funded by reserve fund.',
    '5900': 'Truist bank fees.',
  }

  const { data: coa } = await db
    .from('chart_of_accounts')
    .select('id, account_number, description')
    .eq('association_id', ASSOC_ID)
  if (!coa) return

  let updated = 0
  for (const a of coa) {
    if (a.description) continue
    const desc = descriptions[a.account_number]
    if (!desc) continue
    await db
      .from('chart_of_accounts')
      .update({ description: desc })
      .eq('id', a.id)
    updated++
  }
  console.log(`[coa] ✓ added descriptions to ${updated} accounts`)
}

async function fillFiscalPeriodCloseDate(db: Db): Promise<void> {
  const { data } = await db
    .from('fiscal_periods')
    .select('id, start_date, status, closed_at')
    .eq('association_id', ASSOC_ID)
  if (!data) return
  for (const p of data) {
    if (p.status === 'closed' && !p.closed_at) {
      await db
        .from('fiscal_periods')
        .update({ closed_at: '2026-02-15T00:00:00Z' })
        .eq('id', p.id)
      console.log(`[fiscal_periods] ✓ marked FY2025 closed_at`)
    }
  }
}

async function fillHoaPropertyOwners(db: Db): Promise<void> {
  // Denormalize the primary owner contact from ownerships onto each
  // hoa_property row, which simplifies the properties list view.
  const { data: props } = await db
    .from('hoa_properties')
    .select('id, owner_name')
    .eq('org_id', ORG_ID)
    .is('owner_name', null)
  if (!props || props.length === 0) {
    console.log('[hoa_properties] all rows already have owner contact')
    return
  }

  const { data: units } = await db
    .from('units')
    .select('id, legacy_hoa_property_id')
    .eq('organization_id', ORG_ID)
  const unitByLegacy = new Map(
    (units ?? [])
      .filter((u) => u.legacy_hoa_property_id)
      .map((u) => [u.legacy_hoa_property_id as string, u.id]),
  )

  const { data: ownerships } = await db
    .from('ownerships')
    .select('unit_id, owner_name, owner_email, owner_phone, ownership_pct')
    .eq('organization_id', ORG_ID)
  // Group ownerships by unit_id, pick the highest-percentage owner.
  const ownerByUnit = new Map<string, { name: string; email: string; phone: string }>()
  for (const o of ownerships ?? []) {
    if (!o.unit_id || !o.owner_name) continue
    const prev = ownerByUnit.get(o.unit_id)
    if (!prev || (o.ownership_pct ?? 0) > 0) {
      ownerByUnit.set(o.unit_id, {
        name: o.owner_name,
        email: o.owner_email ?? '',
        phone: o.owner_phone ?? '',
      })
    }
  }

  let updated = 0
  for (const p of props) {
    const unitId = unitByLegacy.get(p.id)
    if (!unitId) continue
    const owner = ownerByUnit.get(unitId)
    if (!owner) continue
    await db
      .from('hoa_properties')
      .update({
        owner_name: owner.name,
        owner_email: owner.email,
        owner_phone: owner.phone,
      })
      .eq('id', p.id)
    updated++
  }
  console.log(`[hoa_properties] ✓ denormalized owner contact onto ${updated} rows`)
}

async function fillUnitDetails(db: Db): Promise<void> {
  const { data: units } = await db
    .from('units')
    .select('id, address_line1, bedrooms, bathrooms, square_feet, lot_number')
    .eq('organization_id', ORG_ID)
  if (!units) return

  let updated = 0
  for (const [i, u] of units.entries()) {
    if (u.bedrooms && u.bathrooms && u.square_feet) continue
    // Deterministic: vary across the 135 homes — most are 3BR/2.5BA ~2400sqft,
    // ~20% are 4BR/3BA ~2900sqft, ~10% are 2BR/2BA ~1800sqft (a row of
    // ranch homes on Hollybrook).
    const variant = i % 10
    let bedrooms, bathrooms, sqft
    if (variant < 2) {
      bedrooms = 4; bathrooms = 3; sqft = 2900
    } else if (variant === 9) {
      bedrooms = 2; bathrooms = 2; sqft = 1800
    } else {
      bedrooms = 3; bathrooms = 2.5; sqft = 2400
    }
    await db
      .from('units')
      .update({
        bedrooms,
        bathrooms,
        square_feet: sqft,
        lot_number: `LOT-${String(i + 1).padStart(3, '0')}`,
      })
      .eq('id', u.id)
    updated++
  }
  console.log(`[units] ✓ filled bedrooms/bathrooms/sqft/lot_number on ${updated} rows`)
}

// ─── Bank accounts ────────────────────────────────────────────────────

async function seedBankAccounts(
  db: Db,
): Promise<{ OPERATING: string; RESERVE: string }> {
  const { data: existing } = await db
    .from('bank_accounts')
    .select('id, account_name')
    .eq('association_id', ASSOC_ID)
  const byName = new Map<string, string>(
    (existing ?? []).map((b) => [b.account_name, b.id]),
  )

  const { data: funds } = await db
    .from('funds')
    .select('id, code')
    .eq('association_id', ASSOC_ID)
  const fundByCode = new Map((funds ?? []).map((f) => [f.code, f.id]))

  const want = [
    { account_name: 'Truist Operating', code: 'OPERATING', bank: 'Truist Bank', last4: '4189', balance: 82400.55 },
    { account_name: 'Truist Reserve MM', code: 'RESERVE', bank: 'Truist Bank', last4: '7234', balance: 98212.18 },
  ]

  for (const w of want) {
    if (byName.has(w.account_name)) continue
    const fundId = fundByCode.get(w.code)
    if (!fundId) continue
    const { data, error } = await db
      .from('bank_accounts')
      .insert({
        organization_id: ORG_ID,
        association_id: ASSOC_ID,
        fund_id: fundId,
        account_name: w.account_name,
        bank_name: w.bank,
        last4: w.last4,
        current_balance: w.balance,
        is_active: true,
      })
      .select('id, account_name')
      .single()
    if (error || !data) throw new Error(`[bank] ${w.account_name}: ${error?.message}`)
    byName.set(data.account_name, data.id)
  }
  console.log('[bank_accounts] ✓ Operating + Reserve at Truist Bank')
  return {
    OPERATING: byName.get('Truist Operating')!,
    RESERVE: byName.get('Truist Reserve MM')!,
  }
}

// ─── Accounting context ──────────────────────────────────────────────

interface AccountingContext {
  fp2025: string
  fp2026: string
  fundOp: string
  fundRsv: string
  acct: Record<string, string>
  vendors: Array<{ id: string; legal_name: string }>
}

async function loadAccountingContext(db: Db): Promise<AccountingContext> {
  const { data: fps } = await db
    .from('fiscal_periods')
    .select('id, start_date')
    .eq('association_id', ASSOC_ID)
  const fp2025 = fps?.find((f) => f.start_date === '2025-01-01')?.id
  const fp2026 = fps?.find((f) => f.start_date === '2026-01-01')?.id
  if (!fp2025 || !fp2026) throw new Error('missing fiscal periods')

  const { data: funds } = await db
    .from('funds')
    .select('id, code')
    .eq('association_id', ASSOC_ID)
  const fundOp = funds?.find((f) => f.code === 'OPERATING')?.id
  const fundRsv = funds?.find((f) => f.code === 'RESERVE')?.id
  if (!fundOp || !fundRsv) throw new Error('missing funds')

  const { data: coa } = await db
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('association_id', ASSOC_ID)
  const acct: Record<string, string> = {}
  for (const c of coa ?? []) acct[c.account_number] = c.id

  const { data: vendors } = await db
    .from('vendors')
    .select('id, legal_name')
    .eq('organization_id', ORG_ID)
    .order('legal_name')

  return { fp2025, fp2026, fundOp, fundRsv, acct, vendors: vendors ?? [] }
}

// ─── Journal entries ─────────────────────────────────────────────────

const MONTHS_2025 = Array.from({ length: 12 }, (_, i) =>
  `2025-${String(i + 1).padStart(2, '0')}`,
)

async function seedJournalEntries(
  db: Db,
  ctx: AccountingContext,
  bankIds: { OPERATING: string; RESERVE: string },
): Promise<void> {
  const { count: existing } = await db
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('association_id', ASSOC_ID)
  if (existing && existing > 12) {
    console.log(`[journal_entries] ${existing} present, skipping`)
    return
  }

  // Standard monthly accrual amounts (matches the 2026 budget approved
  // in October 2025; FY2025 was slightly under-priced).
  const ASSESSMENT_INCOME = 135 * 285 // $38,475/mo in 2025 — pre-increase
  const RECURRING = [
    { acct: '5000', monthly: 4850, memo: 'Verde Garden Co — monthly landscape contract', vendorName: 'Verde Garden Co, LLC' },
    { acct: '5010', monthly: 3450, memo: 'Common-area utilities (water + electric)', vendorName: null },
    { acct: '5020', monthly: 3050, memo: 'Master insurance premium (annualized monthly)', vendorName: 'Cole-Walker Insurance Brokers' },
    { acct: '5040', monthly: 1850, memo: 'Repairs & maintenance — variable monthly avg', vendorName: null },
    { acct: '5050', monthly: 950, memo: 'Stillwater CPA monthly retainer + legal as-needed', vendorName: 'Stillwater CPA Group LLC' },
    { acct: '5060', monthly: 425, memo: 'Office, postage, software', vendorName: null },
    { acct: '5900', monthly: 145, memo: 'Truist bank fees', vendorName: null },
  ]
  const QUARTERLY_RESERVE_TRANSFER = 19500 // $78K/year as approved

  let postedCount = 0

  for (const yyyymm of MONTHS_2025) {
    const monthEnd = lastDayOfMonth(yyyymm)
    // 1. Assessment income receivable → income (accrual on the 1st)
    const arResult = await postJournalEntry(db as never, {
      organizationId: ORG_ID,
      associationId: ASSOC_ID,
      fiscalPeriodId: ctx.fp2025,
      entryDate: `${yyyymm}-01`,
      memo: `Monthly assessment accrual — ${yyyymm}`,
      source: 'recurring',
      lines: [
        { accountId: ctx.acct['1100'], fundId: ctx.fundOp, debit: ASSESSMENT_INCOME, credit: 0, memo: 'AR' },
        { accountId: ctx.acct['4000'], fundId: ctx.fundOp, debit: 0, credit: ASSESSMENT_INCOME, memo: 'Income' },
      ],
    })
    if (!arResult.ok) console.warn(`[je] ${yyyymm} AR failed: ${arResult.error}`)
    else postedCount++

    // 2. Cash receipt for paid assessments (most of AR clears by month end)
    const cashReceipt = Math.round(ASSESSMENT_INCOME * 0.94) // ~6% AR carries
    const cashResult = await postJournalEntry(db as never, {
      organizationId: ORG_ID,
      associationId: ASSOC_ID,
      fiscalPeriodId: ctx.fp2025,
      entryDate: monthEnd,
      memo: `Assessment receipts cleared — ${yyyymm}`,
      source: 'ar_payment',
      lines: [
        { accountId: ctx.acct['1010'], fundId: ctx.fundOp, debit: cashReceipt, credit: 0, memo: 'Cash in' },
        { accountId: ctx.acct['1100'], fundId: ctx.fundOp, debit: 0, credit: cashReceipt, memo: 'AR cleared' },
      ],
    })
    if (cashResult.ok) postedCount++

    // 3. Recurring expenses for the month (one JE per category)
    for (const exp of RECURRING) {
      const r = await postJournalEntry(db as never, {
        organizationId: ORG_ID,
        associationId: ASSOC_ID,
        fiscalPeriodId: ctx.fp2025,
        entryDate: `${yyyymm}-15`,
        memo: exp.memo + ` (${yyyymm})`,
        source: 'manual',
        lines: [
          { accountId: ctx.acct[exp.acct], fundId: ctx.fundOp, debit: exp.monthly, credit: 0, memo: 'Expense' },
          { accountId: ctx.acct['1010'], fundId: ctx.fundOp, debit: 0, credit: exp.monthly, memo: 'Cash out' },
        ],
      })
      if (r.ok) postedCount++
    }

    // 4. Quarterly reserve transfer (Mar / Jun / Sep / Dec)
    const month = Number(yyyymm.split('-')[1])
    if (month % 3 === 0) {
      const t = await postJournalEntry(db as never, {
        organizationId: ORG_ID,
        associationId: ASSOC_ID,
        fiscalPeriodId: ctx.fp2025,
        entryDate: monthEnd,
        memo: `Quarterly reserve transfer Q${month / 3} 2025`,
        source: 'manual',
        lines: [
          { accountId: ctx.acct['1010'], fundId: ctx.fundOp, debit: 0, credit: QUARTERLY_RESERVE_TRANSFER, memo: 'Out of operating' },
          { accountId: ctx.acct['3000'], fundId: ctx.fundOp, debit: QUARTERLY_RESERVE_TRANSFER, credit: 0, memo: 'Equity reduction' },
          { accountId: ctx.acct['1020'], fundId: ctx.fundRsv, debit: QUARTERLY_RESERVE_TRANSFER, credit: 0, memo: 'Into reserve' },
          { accountId: ctx.acct['3010'], fundId: ctx.fundRsv, debit: 0, credit: QUARTERLY_RESERVE_TRANSFER, memo: 'Equity addition' },
        ],
      })
      if (t.ok) postedCount++
    }
  }

  // 5. July HVAC emergency expense (the famous one from the meetings)
  const hvac = await postJournalEntry(db as never, {
    organizationId: ORG_ID,
    associationId: ASSOC_ID,
    fiscalPeriodId: ctx.fp2025,
    entryDate: '2025-07-05',
    memo: 'Reliable HVAC — emergency clubhouse compressor replacement (Bd action 2025-07-08)',
    source: 'ap_invoice',
    lines: [
      { accountId: ctx.acct['5040'], fundId: ctx.fundOp, debit: 9400, credit: 0, memo: 'Emergency repair' },
      { accountId: ctx.acct['1010'], fundId: ctx.fundOp, debit: 0, credit: 9400, memo: 'Cash out' },
    ],
  })
  if (hvac.ok) postedCount++

  console.log(`[journal_entries] ✓ posted ${postedCount} balanced JEs for FY2025`)
}

// ─── Invoices + payments ─────────────────────────────────────────────

async function seedInvoicesAndPayments(
  db: Db,
  ctx: AccountingContext,
): Promise<void> {
  const { count: existing } = await db
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
  if (existing && existing > 0) {
    console.log(`[invoices] ${existing} present, skipping`)
    return
  }

  // 40 vendor invoices across the year (mix of vendors)
  const VENDOR_INVOICE_PATTERNS = [
    { name: 'Verde Garden Co, LLC', months: MONTHS_2025, amount: 4850 },
    { name: 'Atlanta Pool Pros LLC', months: ['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09'], amount: 1800 },
    { name: 'Cole-Walker Insurance Brokers', months: ['2025-01'], amount: 36600 },
    { name: 'Stillwater CPA Group LLC', months: ['2025-03', '2025-06', '2025-09', '2025-12'], amount: 1200 },
    { name: 'Mockingbird Tree Service', months: ['2025-09'], amount: 2200 },
    { name: 'Southern Roofing Solutions', months: ['2025-09'], amount: 4500 },
    { name: 'Sentry Security Patrol Co', months: ['2025-01', '2025-04', '2025-07', '2025-10'], amount: 1800 },
    { name: 'Cobb County Pest Control', months: ['2025-03', '2025-06', '2025-09', '2025-12'], amount: 425 },
    { name: 'CleanStream Janitorial', months: MONTHS_2025, amount: 850 },
    { name: 'Holloway & Reed, Attorneys at Law', months: ['2025-05', '2025-11'], amount: 2400 },
  ]

  const vendorByName = new Map(ctx.vendors.map((v) => [v.legal_name, v.id]))
  const invoices: Array<{
    organization_id: string
    association_id: string
    vendor_id: string
    amount: number
    invoice_date: string
    due_date: string
    invoice_number: string
    status: string
  }> = []

  let invoiceCounter = 0
  for (const pattern of VENDOR_INVOICE_PATTERNS) {
    const vendorId = vendorByName.get(pattern.name)
    if (!vendorId) continue
    for (const month of pattern.months) {
      invoiceCounter++
      const invoiceDate = `${month}-01`
      const dueDate = `${month}-${month === '2025-02' ? '28' : '30'}`
      invoices.push({
        organization_id: ORG_ID,
        association_id: ASSOC_ID,
        vendor_id: vendorId,
        amount: pattern.amount,
        invoice_date: invoiceDate,
        due_date: dueDate,
        invoice_number: `INV-${month.replace('-', '')}-${String(invoiceCounter).padStart(3, '0')}`,
        status: 'paid',
      })
    }
  }

  // Insert in batches
  let inserted = 0
  for (let i = 0; i < invoices.length; i += 50) {
    const batch = invoices.slice(i, i + 50)
    const { error } = await db.from('invoices').insert(batch as never)
    if (error) throw new Error(`[invoices] batch ${i}: ${error.message}`)
    inserted += batch.length
  }
  console.log(`[invoices] ✓ ${inserted} invoices`)

  // Now insert matching payments — each paid invoice gets one ACH payment.
  const { data: insertedInvoices } = await db
    .from('invoices')
    .select('id, vendor_id, amount, invoice_date, due_date')
    .eq('organization_id', ORG_ID)

  const paymentInserts =
    (insertedInvoices ?? []).map((inv) => ({
      organization_id: ORG_ID,
      invoice_id: inv.id,
      amount: inv.amount,
      paid_at: `${inv.due_date}T15:00:00Z`,
      payment_method: 'ach',
      external_ref: `ACH-${inv.id.slice(0, 8).toUpperCase()}`,
    }))

  for (let i = 0; i < paymentInserts.length; i += 50) {
    const { error } = await db
      .from('payments')
      .insert(paymentInserts.slice(i, i + 50) as never)
    if (error) throw new Error(`[payments] batch ${i}: ${error.message}`)
  }
  console.log(`[payments] ✓ ${paymentInserts.length} payments`)
}

// ─── Payment methods (homeowner ACH samples) ─────────────────────────

async function seedPaymentMethods(db: Db): Promise<void> {
  const { count: existing } = await db
    .from('payment_methods')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
  if (existing && existing > 0) {
    console.log(`[payment_methods] ${existing} present, skipping`)
    return
  }

  const { data: units } = await db
    .from('units')
    .select('id')
    .eq('organization_id', ORG_ID)
    .limit(40)
  if (!units) return

  const inserts = units.map((u, i) => ({
    organization_id: ORG_ID,
    unit_id: u.id,
    method_type: i % 5 === 0 ? 'card' : 'ach',
    last4: String(1000 + i * 37).slice(-4),
    is_default: true,
    is_active: true,
  }))
  const { error } = await db.from('payment_methods').insert(inserts as never)
  if (error) throw new Error(`[payment_methods]: ${error.message}`)
  console.log(`[payment_methods] ✓ ${inserts.length} active methods on file`)
}

// ─── Bank transactions (for reconciliation demos) ────────────────────

async function seedBankTransactions(
  db: Db,
  bankIds: { OPERATING: string; RESERVE: string },
): Promise<void> {
  const { count: existing } = await db
    .from('bank_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
  if (existing && existing > 0) {
    console.log(`[bank_transactions] ${existing} present, skipping`)
    return
  }

  // Pull JEs and vendor payments to generate matching txns.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id, entry_date, memo')
    .eq('association_id', ASSOC_ID)
    .order('entry_date')
    .limit(150)

  const txns: Array<{
    organization_id: string
    bank_account_id: string
    posted_date: string
    amount: number
    memo: string
    merchant: string
    matched_journal_entry_id: string
    match_method: string
    match_confidence: number
  }> = []

  for (const je of jes ?? []) {
    const memo = je.memo
    if (!memo) continue
    // Simple heuristic: assessment receipts → positive, expenses → negative,
    // reserve transfers → both sides
    let amount = 0
    let merchant = 'TRUIST OPERATING'
    if (memo.includes('Assessment receipts')) {
      amount = 36140 // ~94% of $38,475
      merchant = 'ACH DEPOSIT - HOA ASSESSMENTS'
    } else if (memo.includes('Verde Garden')) {
      amount = -4850
      merchant = 'VERDE GARDEN CO LLC'
    } else if (memo.includes('utilities')) {
      amount = -3450
      merchant = 'COBB EMC + GA POWER'
    } else if (memo.includes('insurance')) {
      amount = -3050
      merchant = 'COLE-WALKER INS BROKERS'
    } else if (memo.includes('Repairs')) {
      amount = -1850
      merchant = 'MISC R&M VENDORS'
    } else if (memo.includes('CPA')) {
      amount = -950
      merchant = 'STILLWATER CPA GROUP'
    } else if (memo.includes('Office')) {
      amount = -425
      merchant = 'OFFICE + SOFTWARE'
    } else if (memo.includes('bank fees')) {
      amount = -145
      merchant = 'TRUIST FEE'
    } else if (memo.includes('HVAC')) {
      amount = -9400
      merchant = 'RELIABLE HVAC INC'
    } else if (memo.includes('reserve transfer')) {
      // emit two: one out of operating, one into reserve
      txns.push({
        organization_id: ORG_ID,
        bank_account_id: bankIds.OPERATING,
        posted_date: je.entry_date,
        amount: -19500,
        memo: 'XFER TO RESERVE MM',
        merchant: 'INTERNAL TRANSFER',
        matched_journal_entry_id: je.id,
        match_method: 'manual',
        match_confidence: 1.0,
      })
      txns.push({
        organization_id: ORG_ID,
        bank_account_id: bankIds.RESERVE,
        posted_date: je.entry_date,
        amount: 19500,
        memo: 'XFER FROM OPERATING',
        merchant: 'INTERNAL TRANSFER',
        matched_journal_entry_id: je.id,
        match_method: 'manual',
        match_confidence: 1.0,
      })
      continue
    } else {
      continue
    }
    txns.push({
      organization_id: ORG_ID,
      bank_account_id: bankIds.OPERATING,
      posted_date: je.entry_date,
      amount,
      memo,
      merchant,
      matched_journal_entry_id: je.id,
      match_method: 'manual',
      match_confidence: 0.96,
    })
  }

  for (let i = 0; i < txns.length; i += 100) {
    const { error } = await db
      .from('bank_transactions')
      .insert(txns.slice(i, i + 100) as never)
    if (error) throw new Error(`[bank_transactions] ${i}: ${error.message}`)
  }
  console.log(`[bank_transactions] ✓ ${txns.length} txns (matched to JEs)`)
}

// ─── HOA documents ───────────────────────────────────────────────────

async function seedHoaDocuments(db: Db): Promise<void> {
  const { count: existing } = await db
    .from('hoa_documents')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', ORG_ID)
  if (existing && existing > 0) {
    console.log(`[hoa_documents] ${existing} present, skipping`)
    return
  }

  // hoa_documents.type enum: rules | minutes | bylaws | other
  // Most demo docs map to 'other'; pool rules + architectural guidelines
  // ride under 'rules'.
  const docs = [
    { name: '2025 Spring Newsletter.pdf', type: 'other', date: '2025-03-15' },
    { name: '2025 Summer Newsletter.pdf', type: 'other', date: '2025-06-15' },
    { name: '2025 Fall Newsletter.pdf', type: 'other', date: '2025-09-15' },
    { name: '2025 Winter Newsletter.pdf', type: 'other', date: '2025-12-15' },
    { name: 'Sterling Reserve Study — 2024 (delivered Jan 2025).pdf', type: 'other', date: '2025-01-27' },
    { name: 'Sentinel Mechanical Audit Report — Aug 2025.pdf', type: 'other', date: '2025-09-09' },
    { name: '2024 Annual Financial Report (Henson & Associates).pdf', type: 'other', date: '2025-02-15' },
    { name: '2026 Operating Budget — Board Approved Oct 2025.pdf', type: 'other', date: '2025-10-14' },
    { name: '2026 Approved Fine Schedule.pdf', type: 'rules', date: '2025-11-25' },
    { name: 'Pool Rules — 2025 Season.pdf', type: 'rules', date: '2025-05-15' },
    { name: 'Architectural Design Guidelines (Revised 2024).pdf', type: 'rules', date: '2024-09-01' },
    { name: 'Vendor Insurance Certificates — Current.pdf', type: 'other', date: '2025-01-15' },
  ]
  const inserts = docs.map((d) => ({
    org_id: ORG_ID,
    name: d.name,
    type: d.type,
    storage_path: `demo/${ORG_ID}/${d.name.toLowerCase().replace(/[^a-z0-9.]/g, '-')}`,
    file_size: 100000 + Math.floor(Math.random() * 900000),
    created_at: `${d.date}T00:00:00Z`,
  }))
  const { error } = await db.from('hoa_documents').insert(inserts as never)
  if (error) throw new Error(`[hoa_documents]: ${error.message}`)
  console.log(`[hoa_documents] ✓ ${inserts.length} document records`)
}

// ─── Recurring journal entries ───────────────────────────────────────

async function seedRecurringJournalEntries(
  db: Db,
  ctx: AccountingContext,
): Promise<void> {
  const { count: existing } = await db
    .from('recurring_journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('association_id', ASSOC_ID)
  if (existing && existing > 0) {
    console.log(`[recurring_journal_entries] ${existing} present, skipping`)
    return
  }

  // Use one existing JE as the template (the first monthly assessment accrual).
  const { data: templateJe } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', ASSOC_ID)
    .ilike('memo', 'Monthly assessment accrual%')
    .order('entry_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!templateJe) {
    console.log('[recurring_journal_entries] no template JE found, skipping')
    return
  }

  const { error } = await db.from('recurring_journal_entries').insert({
    organization_id: ORG_ID,
    association_id: ASSOC_ID,
    template_je_id: templateJe.id,
    cadence: 'monthly',
    next_run_date: '2026-06-01',
    is_active: true,
  })
  if (error) throw new Error(`[recurring_journal_entries]: ${error.message}`)
  console.log(`[recurring_journal_entries] ✓ monthly assessment accrual template`)
}

// ─── Helpers ─────────────────────────────────────────────────────────

function lastDayOfMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${yyyymm}-${String(d).padStart(2, '0')}`
}

main().catch((err) => {
  console.error('[complete] crashed:', err)
  process.exit(1)
})
