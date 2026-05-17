/**
 * scripts/test-ap.ts
 *
 * End-to-end verification of Phase 4 — AP (vendor bills + bill-pay). Hits
 * real Postgres, exercises the full flow: vendor → bill → bill-pay.
 *
 * Pattern matches test-ar.ts. We mirror the server actions in
 * apps/hoa/src/lib/invoices.ts rather than importing them, because the
 * server actions depend on next/cache + cookies + getCurrentOrg —
 * unavailable from a CLI. The harness drives the same DB shape through
 * the same shared composer (postJournalEntry) the server actions use.
 *
 * Usage:
 *   pnpm test:ap
 *   SEED_ORG_NAME="Madison Park HOA" pnpm test:ap
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { loadAccountingRefs, postJournalEntry } from '../packages/db/src/index'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-ap] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

const HARNESS_TAG = 'test-ap-harness'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

interface Fixture {
  organizationId: string
  associationId: string
  fiscalPeriodId: string
  vendorId: string
  expenseAccountId: string
  refs: NonNullable<Awaited<ReturnType<typeof loadAccountingRefs>>>
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(
    `[test-ap] assoc=${fixture.associationId} vendor=${fixture.vendorId} expense=${fixture.expenseAccountId.slice(0, 8)}…\n`,
  )

  const ids: { invoiceId?: string; paymentJeId?: string; billJeId?: string } = {}
  try {
    const invoiceId = await testEnterBill(db, fixture)
    if (invoiceId) {
      ids.invoiceId = invoiceId
      await testMarkInvoicePaid(db, fixture, invoiceId)
    }
    await testTrialBalanceZeroSum(db, fixture)
  } finally {
    await cleanup(db, fixture, ids)
  }

  console.log(`\n[test-ap] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── enter bill ──────────────────────────────────────────────────────

async function testEnterBill(db: Db, f: Fixture): Promise<string | null> {
  console.log('enter bill: invoice row + Dr Expense / Cr AP:')
  const amount = 480
  const invoiceNumber = `${HARNESS_TAG}-${Date.now()}-A`

  const { data: invoice, error: iErr } = await db
    .from('invoices')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      vendor_id: f.vendorId,
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount,
      status: 'received',
    })
    .select('id')
    .single()
  if (iErr || !invoice) {
    check('insert invoice', false, iErr?.message)
    return null
  }
  check('insert invoice', true)

  const je = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `harness: bill entered (${invoice.id.slice(0, 8)})`,
    source: 'ap_invoice',
    sourceId: invoice.id,
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: amount, credit: 0 },
      { accountId: f.refs.acctAP, fundId: f.refs.fundOperating, debit: 0, credit: amount },
    ],
  })
  check('post Dr Expense / Cr AP JE', je.ok, je.ok ? '' : je.error)
  if (!je.ok) return null

  const { error: updErr } = await db
    .from('invoices')
    .update({ status: 'approved' })
    .eq('id', invoice.id)
  check("invoice.status → 'approved'", !updErr, updErr?.message)

  return invoice.id
}

// ─── mark paid ───────────────────────────────────────────────────────

async function testMarkInvoicePaid(db: Db, f: Fixture, invoiceId: string): Promise<void> {
  console.log('\nmark paid: payment row + Dr AP / Cr Cash:')

  const { data: inv } = await db
    .from('invoices')
    .select('amount, organization_id')
    .eq('id', invoiceId)
    .single()
  if (!inv) {
    check('reload invoice', false)
    return
  }

  const amount = Number(inv.amount)
  const paidAt = new Date().toISOString()

  const { data: payment, error: pErr } = await db
    .from('payments')
    .insert({
      organization_id: inv.organization_id,
      invoice_id: invoiceId,
      amount,
      payment_method: 'check',
      external_ref: `${HARNESS_TAG}-check-1234`,
      paid_at: paidAt,
    })
    .select('id')
    .single()
  if (pErr || !payment) {
    check('insert payment', false, pErr?.message)
    return
  }
  check('insert payment', true)

  const je = await postJournalEntry(db, {
    organizationId: inv.organization_id,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: paidAt.slice(0, 10),
    memo: `harness: bill paid (payment ${payment.id.slice(0, 8)})`,
    source: 'ap_invoice',
    sourceId: payment.id,
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctAP, fundId: f.refs.fundOperating, debit: amount, credit: 0 },
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 0, credit: amount },
    ],
  })
  check('post Dr AP / Cr Cash JE', je.ok, je.ok ? '' : je.error)
  if (!je.ok) return

  await db
    .from('payments')
    .update({ journal_entry_id: je.journalEntryId })
    .eq('id', payment.id)

  const { error: invErr } = await db
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)
  check("invoice.status → 'paid'", !invErr, invErr?.message)

  // Verify the round-trip: payment links to JE, JE links to invoice via
  // source_id (the payment's id, not the invoice id) — which is the
  // intended encoding so the same source/source_id columns work for AR
  // and AP receipts uniformly.
  const { data: payReload } = await db
    .from('payments')
    .select('journal_entry_id, invoice_id')
    .eq('id', payment.id)
    .single()
  check('payment.journal_entry_id linked', payReload?.journal_entry_id === je.journalEntryId)
  check('payment.invoice_id correct', payReload?.invoice_id === invoiceId)
}

// ─── trial balance zero-sum ──────────────────────────────────────────

async function testTrialBalanceZeroSum(db: Db, f: Fixture): Promise<void> {
  console.log('\ntrial balance:')
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const ids = (jes ?? []).map((r) => r.id)
  const { data: lines } = await db
    .from('ledger_entries')
    .select('debit_amount, credit_amount')
    .in('journal_entry_id', ids)
  const totalDr = (lines ?? []).reduce((s, l) => s + Number(l.debit_amount), 0)
  const totalCr = (lines ?? []).reduce((s, l) => s + Number(l.credit_amount), 0)
  check(
    'harness JEs zero-sum',
    totalDr === totalCr,
    `Dr=${totalDr} Cr=${totalCr}`,
  )
  // Specifically: bill-entry was +$480 Dr Expense / +$480 Cr AP.
  // Bill-pay was +$480 Dr AP / +$480 Cr Cash. So Dr=Cr=$960 across both.
  check(
    'Dr total = Cr total = $960',
    totalDr === 960 && totalCr === 960,
    `got Dr=${totalDr} Cr=${totalCr}`,
  )
}

// ─── fixture / cleanup ───────────────────────────────────────────────

async function loadFixture(db: Db): Promise<Fixture> {
  const targetOrgName = process.env.SEED_ORG_NAME

  const { data: assocs } = await db
    .from('associations')
    .select('id, organization_id, orgs:organization_id(name, hub_type)')
    .order('created_at', { ascending: true })

  const assoc = (assocs ?? []).find((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetOrgName && org.name !== targetOrgName) return false
    return true
  })
  if (!assoc) throw new Error('no HOA association — run pnpm seed:accounting')

  const [period, refs, expense] = await Promise.all([
    db
      .from('fiscal_periods')
      .select('id')
      .eq('association_id', assoc.id)
      .eq('status', 'open')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadAccountingRefs(db, assoc.id),
    db
      .from('chart_of_accounts')
      .select('id, account_number')
      .eq('association_id', assoc.id)
      .eq('account_type', 'expense')
      .eq('is_active', true)
      .order('account_number')
      .limit(1),
  ])
  if (!period.data) throw new Error('no open fiscal period')
  if (!refs) throw new Error('accounting refs missing')
  if (!expense.data?.[0]) throw new Error('no expense account in COA')

  // Vendor: find existing harness vendor or create one. Vendors are
  // org-scoped (no association_id column).
  const harnessVendorName = `${HARNESS_TAG}-vendor`
  const { data: existing } = await db
    .from('vendors')
    .select('id')
    .eq('organization_id', assoc.organization_id)
    .eq('legal_name', harnessVendorName)
    .maybeSingle()

  let vendorId = existing?.id
  if (!vendorId) {
    const { data: created, error } = await db
      .from('vendors')
      .insert({
        organization_id: assoc.organization_id,
        legal_name: harnessVendorName,
        status: 'active',
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(`vendor insert: ${error?.message}`)
    vendorId = created.id
  }

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.data.id,
    vendorId,
    expenseAccountId: expense.data[0].id,
    refs,
  }
}

async function cleanup(
  db: Db,
  f: Fixture,
  ids: { invoiceId?: string },
): Promise<void> {
  // JEs by tag — cascade-deletes ledger_entries.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const jeIds = (jes ?? []).map((r) => r.id)

  // Payments first (FK refs journal_entries; ON DELETE SET NULL, but
  // tidier to delete them by hand).
  if (ids.invoiceId) {
    await db.from('payments').delete().eq('invoice_id', ids.invoiceId)
    await db.from('invoices').delete().eq('id', ids.invoiceId)
  }
  if (jeIds.length > 0) {
    await db.from('journal_entries').delete().in('id', jeIds)
  }

  // Vendor stays — re-used across runs.
  console.log(
    `\n[test-ap] cleaned up invoice=${ids.invoiceId ? 1 : 0}, JEs=${jeIds.length}`,
  )
}

main().catch((err) => {
  console.error('[test-ap] crashed:', err)
  process.exit(1)
})
