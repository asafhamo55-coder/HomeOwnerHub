/**
 * scripts/test-accounting.ts
 *
 * Verification harness for the Phase 1 accounting primitives. Hits the
 * real Supabase project (NOT mocked) — the validate_je_balances trigger
 * is the contract under test, and we will not learn whether it works by
 * mocking around it.
 *
 * The repo doesn't run vitest yet; this script follows the same
 * "self-contained exit 0/1 harness" pattern as scripts/eval-w1.ts.
 *
 * What it checks:
 *
 *   ✓ pre-check: balanced JE posts cleanly, fires the trigger
 *   ✓ pre-check: overall-unbalanced JE rejected at the composer
 *   ✓ pre-check: fund-unbalanced JE rejected at the composer
 *   ✓ trigger: bypassing pre-checks (direct DB write) still triggers
 *     validate_je_balances on the status flip — the DB is the real fence
 *   ✓ entry_number is unique-per-association and monotonic per year
 *
 * Cleanup: every JE this harness writes is tagged source='manual',
 * ai_workflow_id='test-accounting-harness'. We delete them at the end.
 *
 * Usage:
 *
 *   pnpm exec tsx scripts/test-accounting.ts                 # first HOA assoc
 *   SEED_ORG_NAME="Madison Park HOA" pnpm exec tsx \
 *     scripts/test-accounting.ts
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
  console.error('[test-accounting] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-accounting-harness'

type Db = SupabaseClient<Database>

interface Fixture {
  organizationId: string
  associationId: string
  fiscalPeriodId: string
  fundOperating: string
  fundReserve: string
  acctCashOp: string
  acctCashReserve: string
  acctAssessmentIncome: string
  acctAR: string
}

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
    `[test-accounting] using assoc=${fixture.associationId} period=${fixture.fiscalPeriodId}\n`,
  )

  try {
    await testBalancedPosts(db, fixture)
    await testOverallUnbalancedRejected(db, fixture)
    await testFundUnbalancedRejected(db, fixture)
    await testTriggerBackstop(db, fixture)
    await testEntryNumberMonotonic(db, fixture)
  } finally {
    await cleanup(db, fixture.associationId)
  }

  console.log(`\n[test-accounting] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── tests ───────────────────────────────────────────────────────────

async function testBalancedPosts(db: Db, f: Fixture): Promise<void> {
  console.log('balanced JE posts:')
  // AR receipt: Dr Cash 100 / Cr AR 100, all OPERATING fund.
  const result = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'harness: balanced AR receipt',
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.acctCashOp, fundId: f.fundOperating, debit: 100, credit: 0 },
      { accountId: f.acctAR, fundId: f.fundOperating, debit: 0, credit: 100 },
    ],
  })

  check('composer returns ok', result.ok === true, result.ok ? '' : result.error)
  if (!result.ok) return

  const { data: row } = await db
    .from('journal_entries')
    .select('status, posted_at, entry_number')
    .eq('id', result.journalEntryId)
    .single()
  check('status flipped to posted', row?.status === 'posted')
  check('posted_at set', !!row?.posted_at)
  check(
    'entry_number formatted',
    /^JE-\d{4}-\d{5}$/.test(row?.entry_number ?? ''),
    row?.entry_number ?? 'missing',
  )

  const { data: lines } = await db
    .from('ledger_entries')
    .select('debit_amount, credit_amount')
    .eq('journal_entry_id', result.journalEntryId)
  const totalDr = (lines ?? []).reduce((s, l) => s + Number(l.debit_amount), 0)
  const totalCr = (lines ?? []).reduce((s, l) => s + Number(l.credit_amount), 0)
  check('lines balance in DB', totalDr === 100 && totalCr === 100)
}

async function testOverallUnbalancedRejected(db: Db, f: Fixture): Promise<void> {
  console.log('overall-unbalanced rejected:')
  const result = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'harness: overall unbalanced',
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.acctCashOp, fundId: f.fundOperating, debit: 100, credit: 0 },
      { accountId: f.acctAR, fundId: f.fundOperating, debit: 0, credit: 50 },
    ],
  })
  check(
    'composer rejects',
    result.ok === false && result.error.startsWith('unbalanced'),
    result.ok ? 'unexpectedly succeeded' : result.error,
  )
}

async function testFundUnbalancedRejected(db: Db, f: Fixture): Promise<void> {
  console.log('fund-unbalanced rejected (inter-fund transfer must be explicit):')
  // Cash moving from Operating to Reserve, single JE, no explicit pair.
  // Overall balances ($100 = $100) but each fund is net non-zero.
  const result = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'harness: fund unbalanced',
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.acctCashReserve, fundId: f.fundReserve, debit: 100, credit: 0 },
      { accountId: f.acctCashOp, fundId: f.fundOperating, debit: 0, credit: 100 },
    ],
  })
  check(
    'composer rejects',
    result.ok === false && result.error.includes('unbalanced'),
    result.ok ? 'unexpectedly succeeded' : result.error,
  )
}

async function testTriggerBackstop(db: Db, f: Fixture): Promise<void> {
  console.log('DB trigger backstop (bypassing the composer):')
  // Write a draft header + unbalanced lines directly, then try to flip
  // status to 'posted' — the trigger must reject.
  const { data: header, error: headerErr } = await db
    .from('journal_entries')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      fiscal_period_id: f.fiscalPeriodId,
      entry_number: `JE-TRIGGER-${Date.now()}`,
      entry_date: new Date().toISOString().slice(0, 10),
      memo: 'harness: direct unbalanced (trigger backstop)',
      source: 'manual',
      ai_workflow_id: HARNESS_TAG,
      status: 'draft',
    })
    .select('id')
    .single()
  if (headerErr || !header) {
    check('inserted draft header', false, headerErr?.message)
    return
  }

  const { error: linesErr } = await db.from('ledger_entries').insert([
    {
      organization_id: f.organizationId,
      journal_entry_id: header.id,
      account_id: f.acctCashOp,
      fund_id: f.fundOperating,
      debit_amount: 100,
      credit_amount: 0,
    },
    {
      organization_id: f.organizationId,
      journal_entry_id: header.id,
      account_id: f.acctAR,
      fund_id: f.fundOperating,
      debit_amount: 0,
      credit_amount: 75, // intentionally not 100
    },
  ])
  if (linesErr) {
    check('inserted skewed lines', false, linesErr.message)
    return
  }

  const { error: flipErr } = await db
    .from('journal_entries')
    .update({ status: 'posted' })
    .eq('id', header.id)
  check(
    'trigger rejects unbalanced flip',
    !!flipErr && /does not balance|not fund-balanced/i.test(flipErr.message),
    flipErr ? flipErr.message : 'flip unexpectedly succeeded',
  )
}

async function testEntryNumberMonotonic(db: Db, f: Fixture): Promise<void> {
  console.log('entry_number monotonic per year:')
  const a = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'harness: monotonic A',
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.acctCashOp, fundId: f.fundOperating, debit: 1, credit: 0 },
      { accountId: f.acctAR, fundId: f.fundOperating, debit: 0, credit: 1 },
    ],
  })
  const b = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: 'harness: monotonic B',
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.acctCashOp, fundId: f.fundOperating, debit: 2, credit: 0 },
      { accountId: f.acctAR, fundId: f.fundOperating, debit: 0, credit: 2 },
    ],
  })

  check('both posted', a.ok && b.ok)
  if (a.ok && b.ok) {
    check('B > A', b.entryNumber > a.entryNumber, `A=${a.entryNumber} B=${b.entryNumber}`)
  }
}

// ─── fixture loader / cleanup ────────────────────────────────────────

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
  if (!assoc) {
    throw new Error('no HOA association found — run pnpm seed:accounting first')
  }

  const [funds, accounts, period] = await Promise.all([
    db.from('funds').select('id, code').eq('association_id', assoc.id),
    db
      .from('chart_of_accounts')
      .select('id, account_number')
      .eq('association_id', assoc.id),
    db
      .from('fiscal_periods')
      .select('id')
      .eq('association_id', assoc.id)
      .eq('status', 'open')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const fundByCode = new Map<string, string>(
    (funds.data ?? []).map((r) => [r.code, r.id]),
  )
  const acctByNumber = new Map<string, string>(
    (accounts.data ?? []).map((r) => [r.account_number, r.id]),
  )

  const required = ['OPERATING', 'RESERVE']
  for (const code of required) {
    if (!fundByCode.has(code)) {
      throw new Error(`fund ${code} missing — run pnpm seed:accounting`)
    }
  }
  const requiredAccts = ['1010', '1020', '1100', '4000']
  for (const num of requiredAccts) {
    if (!acctByNumber.has(num)) {
      throw new Error(`COA ${num} missing — run pnpm seed:accounting`)
    }
  }
  if (!period.data) {
    throw new Error('no open fiscal_period — run pnpm seed:accounting')
  }

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.data.id,
    fundOperating: fundByCode.get('OPERATING')!,
    fundReserve: fundByCode.get('RESERVE')!,
    acctCashOp: acctByNumber.get('1010')!,
    acctCashReserve: acctByNumber.get('1020')!,
    acctAR: acctByNumber.get('1100')!,
    acctAssessmentIncome: acctByNumber.get('4000')!,
  }
}

async function cleanup(db: Db, associationId: string): Promise<void> {
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', associationId)
    .eq('ai_workflow_id', HARNESS_TAG)

  const ids = (jes ?? []).map((r) => r.id)
  if (ids.length === 0) return

  // ledger_entries cascade-deletes via FK ON DELETE CASCADE.
  const { error } = await db.from('journal_entries').delete().in('id', ids)
  if (error) {
    console.error(`[test-accounting] cleanup failed: ${error.message}`)
  } else {
    console.log(`\n[test-accounting] cleaned up ${ids.length} test JE(s)`)
  }
}

main().catch((err) => {
  console.error('[test-accounting] crashed:', err)
  process.exit(1)
})
