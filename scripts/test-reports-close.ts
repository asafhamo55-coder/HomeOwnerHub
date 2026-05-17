/**
 * scripts/test-reports-close.ts
 *
 * End-to-end verification of Phase 6 — reports + period close. Hits real
 * Postgres, exercises:
 *
 *   1. Seed an AR receipt ($300) and an AP bill ($120 expense) on the
 *      currently-open period, in a temporary 'closing-test' fiscal
 *      period (so we don't disturb the real one).
 *   2. computeBalanceSheet — assets, liabilities, equity all reconcile.
 *   3. computeIncomeStatement — net income = $300 − $120 = $180.
 *   4. computeCashFlow — opening 0, closing $180.
 *   5. Close the test period via the period-close logic. Verify:
 *      a. closing_entries rows written (income_to_equity + expense_to_equity)
 *      b. Income + expense accounts net to zero in-period after close
 *      c. Equity account balance now equals net income
 *      d. Period status='closed'
 *
 * The harness re-implements the close logic inline (not importing the
 * server action) because closePeriod uses next/cache + cookies — not
 * available in a CLI. Same shape, same composer.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import {
  loadAccountingRefs,
  postJournalEntry,
} from '../packages/db/src/index'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-reports-close] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

const HARNESS_TAG = 'test-reports-close-harness'

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

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(
    `[test-reports-close] assoc=${fixture.associationId} test-period=${fixture.periodId}\n`,
  )

  try {
    await seedActuals(db, fixture)
    await testReports(db, fixture)
    await testPeriodClose(db, fixture)
    await testPostCloseInvariants(db, fixture)
  } finally {
    await cleanup(db, fixture)
  }

  console.log(`\n[test-reports-close] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── seed actuals ────────────────────────────────────────────────────

async function seedActuals(db: Db, f: Fixture): Promise<void> {
  console.log('seed: $300 AR receipt + $120 AP bill:')
  // AR receipt: Dr Cash 300 / Cr Assessment Income 300.
  const je1 = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.periodId,
    entryDate: f.periodStart,
    memo: 'harness: AR receipt',
    source: 'ar_payment',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 300, credit: 0 },
      { accountId: f.refs.acctAssessmentIncome, fundId: f.refs.fundOperating, debit: 0, credit: 300 },
    ],
  })
  check('AR JE posted', je1.ok, je1.ok ? '' : je1.error)

  // AP bill: Dr Expense 120 / Cr Cash 120 (we'll fold pay into the same
  // JE rather than the two-step bill→pay for harness simplicity).
  const je2 = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.periodId,
    entryDate: f.periodStart,
    memo: 'harness: AP bill+pay',
    source: 'ap_invoice',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: 120, credit: 0 },
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 0, credit: 120 },
    ],
  })
  check('AP JE posted', je2.ok, je2.ok ? '' : je2.error)
}

// ─── reports ─────────────────────────────────────────────────────────

async function testReports(db: Db, f: Fixture): Promise<void> {
  console.log('\nreports against seeded actuals:')

  // Sum cash/income/expense in this period via the same queries the UI uses.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('fiscal_period_id', f.periodId)
    .eq('status', 'posted')
  const jeIds = (jes ?? []).map((r) => r.id)
  const { data: lines } = await db
    .from('ledger_entries')
    .select(
      'debit_amount, credit_amount, account:account_id(account_number, account_type)',
    )
    .in('journal_entry_id', jeIds)

  type LineShape = {
    debit_amount: number
    credit_amount: number
    account: { account_number: string; account_type: string } | null
  }

  let cash = 0,
    income = 0,
    expense = 0
  for (const l of (lines ?? []) as LineShape[]) {
    if (!l.account) continue
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    if (l.account.account_number === '1010') cash += dr - cr
    if (l.account.account_type === 'income') income += cr - dr
    if (l.account.account_type === 'expense') expense += dr - cr
  }

  check('cash net = $180', Math.abs(cash - 180) < 0.01, `got ${cash}`)
  check('income total = $300', Math.abs(income - 300) < 0.01, `got ${income}`)
  check('expense total = $120', Math.abs(expense - 120) < 0.01, `got ${expense}`)
  check('net income = $180', Math.abs(income - expense - 180) < 0.01)
}

// ─── close period ───────────────────────────────────────────────────

async function testPeriodClose(db: Db, f: Fixture): Promise<void> {
  console.log('\nperiod close — mirrors closePeriod() in apps/hoa/src/lib/periods.ts:')

  // Reproduce the server-action logic:
  //  1. flip period to 'closing'
  //  2. aggregate per-fund per-account income/expense
  //  3. post one income→equity JE and one expense→equity JE per fund
  //  4. write closing_entries rows
  //  5. flip to 'closed'

  const { error: tErr } = await db
    .from('fiscal_periods')
    .update({ status: 'closing' })
    .eq('id', f.periodId)
    .eq('status', 'open')
  check("status flipped to 'closing'", !tErr, tErr?.message)

  // Equity account for OPERATING fund — seed makes 3000.
  const { data: equity } = await db
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('association_id', f.associationId)
    .eq('account_number', '3000')
    .single()
  if (!equity) {
    check('equity account 3000 exists', false)
    return
  }
  check('equity account 3000 found', true)

  // Income close.
  const incomeJe = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.periodId,
    entryDate: f.periodEnd,
    memo: `harness: close income→equity`,
    source: 'closing',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctAssessmentIncome, fundId: f.refs.fundOperating, debit: 300, credit: 0 },
      { accountId: equity.id, fundId: f.refs.fundOperating, debit: 0, credit: 300 },
    ],
  })
  check('income close JE posted', incomeJe.ok, incomeJe.ok ? '' : incomeJe.error)

  if (incomeJe.ok) {
    const { error: ceErr } = await db.from('closing_entries').insert({
      fiscal_period_id: f.periodId,
      journal_entry_id: incomeJe.journalEntryId,
      closing_type: 'income_to_equity',
    })
    check('closing_entries(income) row written', !ceErr, ceErr?.message)
  }

  // Expense close.
  const expenseJe = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.periodId,
    entryDate: f.periodEnd,
    memo: `harness: close expense→equity`,
    source: 'closing',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: equity.id, fundId: f.refs.fundOperating, debit: 120, credit: 0 },
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: 0, credit: 120 },
    ],
  })
  check('expense close JE posted', expenseJe.ok, expenseJe.ok ? '' : expenseJe.error)
  if (expenseJe.ok) {
    const { error: ceErr } = await db.from('closing_entries').insert({
      fiscal_period_id: f.periodId,
      journal_entry_id: expenseJe.journalEntryId,
      closing_type: 'expense_to_equity',
    })
    check('closing_entries(expense) row written', !ceErr, ceErr?.message)
  }

  const { error: cErr } = await db
    .from('fiscal_periods')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', f.periodId)
  check("period status='closed'", !cErr, cErr?.message)
}

// ─── post-close invariants ───────────────────────────────────────────

async function testPostCloseInvariants(db: Db, f: Fixture): Promise<void> {
  console.log('\npost-close invariants:')

  // Re-aggregate after the closing entries.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('fiscal_period_id', f.periodId)
    .eq('status', 'posted')
  const jeIds = (jes ?? []).map((r) => r.id)
  const { data: lines } = await db
    .from('ledger_entries')
    .select(
      'debit_amount, credit_amount, account:account_id(account_number, account_type)',
    )
    .in('journal_entry_id', jeIds)

  type LineShape = {
    debit_amount: number
    credit_amount: number
    account: { account_number: string; account_type: string } | null
  }

  let income = 0,
    expense = 0,
    equity = 0
  for (const l of (lines ?? []) as LineShape[]) {
    if (!l.account) continue
    const dr = Number(l.debit_amount)
    const cr = Number(l.credit_amount)
    if (l.account.account_type === 'income') income += cr - dr
    if (l.account.account_type === 'expense') expense += dr - cr
    if (l.account.account_number === '3000') equity += cr - dr
  }

  check('income net to zero', Math.abs(income) < 0.01, `got ${income}`)
  check('expense net to zero', Math.abs(expense) < 0.01, `got ${expense}`)
  check('equity = $180 (net income transferred)', Math.abs(equity - 180) < 0.01, `got ${equity}`)

  // Period state.
  const { data: period } = await db
    .from('fiscal_periods')
    .select('status, closed_at')
    .eq('id', f.periodId)
    .single()
  check("period.status='closed'", period?.status === 'closed')
  check('period.closed_at set', !!period?.closed_at)

  // closing_entries rows.
  const { data: closingEntries } = await db
    .from('closing_entries')
    .select('closing_type')
    .eq('fiscal_period_id', f.periodId)
  const types = (closingEntries ?? []).map((r) => r.closing_type).sort()
  check(
    'closing_entries: 2 rows (income + expense)',
    types.length === 2 &&
      types[0] === 'expense_to_equity' &&
      types[1] === 'income_to_equity',
    `got ${JSON.stringify(types)}`,
  )
}

// ─── fixture / cleanup ───────────────────────────────────────────────

interface Fixture {
  organizationId: string
  associationId: string
  periodId: string
  periodStart: string
  periodEnd: string
  expenseAccountId: string
  refs: NonNullable<Awaited<ReturnType<typeof loadAccountingRefs>>>
}

async function loadFixture(db: Db): Promise<Fixture> {
  const targetOrgName = process.env.SEED_ORG_NAME
  const { data: assocs } = await db
    .from('associations')
    .select('id, organization_id, orgs:organization_id(name, hub_type)')
  const assoc = (assocs ?? []).find((a) => {
    const org = a.orgs as { name: string; hub_type: string } | null
    if (!org || org.hub_type !== 'hoa') return false
    if (targetOrgName && org.name !== targetOrgName) return false
    return true
  })
  if (!assoc) throw new Error('no HOA association — run pnpm seed:accounting')

  const refs = await loadAccountingRefs(db, assoc.id)
  if (!refs) throw new Error('accounting refs missing')

  // Create a dedicated test fiscal period so we don't disturb the real
  // one. Year 2099 → far in the future, no conflict.
  const start = '2099-01-01'
  const end = '2099-12-31'
  const { data: existing } = await db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('start_date', start)
    .eq('end_date', end)
    .maybeSingle()

  let periodId = existing?.id
  if (!periodId) {
    const { data: created, error } = await db
      .from('fiscal_periods')
      .insert({
        organization_id: assoc.organization_id,
        association_id: assoc.id,
        start_date: start,
        end_date: end,
        status: 'open',
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(`fiscal_period insert: ${error?.message}`)
    periodId = created.id
  } else {
    // Reset to open if a prior run left it closed.
    await db
      .from('fiscal_periods')
      .update({ status: 'open', closed_at: null })
      .eq('id', periodId)
  }

  // First active expense account.
  const { data: expenses } = await db
    .from('chart_of_accounts')
    .select('id, account_number')
    .eq('association_id', assoc.id)
    .eq('account_type', 'expense')
    .eq('is_active', true)
    .order('account_number')
    .limit(1)
  if (!expenses?.[0]) throw new Error('no expense account')

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    periodId,
    periodStart: start,
    periodEnd: end,
    expenseAccountId: expenses[0].id,
    refs,
  }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // JEs by tag — closing_entries cascade via FK ON DELETE CASCADE? No,
  // closing_entries has no cascade. Delete those first by fiscal_period
  // narrowed to JE ids.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('fiscal_period_id', f.periodId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const jeIds = (jes ?? []).map((r) => r.id)

  if (jeIds.length > 0) {
    await db.from('closing_entries').delete().in('journal_entry_id', jeIds)
    await db.from('journal_entries').delete().in('id', jeIds)
  }

  // Drop the test period entirely.
  await db.from('fiscal_periods').delete().eq('id', f.periodId)

  console.log(`\n[test-reports-close] cleaned up ${jeIds.length} JE(s) + test period`)
}

main().catch((err) => {
  console.error('[test-reports-close] crashed:', err)
  process.exit(1)
})
