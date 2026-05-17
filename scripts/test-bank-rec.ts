/**
 * scripts/test-bank-rec.ts
 *
 * End-to-end verification of W18 — Bank Reconciliation Agent. Hits real
 * Postgres + invokes the full workflow (which logs into `ai_runs` like
 * the production path would).
 *
 * Covered cases:
 *
 *   1. parseMemoCode — runs the 8 fixture MEMO_PARSE_CASES from eval.ts
 *      (pure function, no DB).
 *   2. Step A — inbound deposit with exact memo + amount → auto-posts a
 *      bank_rec JE, marks the assessment paid, links bank_transaction,
 *      writes zelle_inbound_matches row.
 *   3. Memo code right, amount wrong → no auto-post, status='unmatched'
 *      audit row written.
 *   4. Malformed memo + amount within fuzzy tolerance → Step B queues
 *      with confidence < auto-post floor.
 *   5. Outbound payment with no merchant match → Step D queues at
 *      confidence 0.
 *   6. Step C — re-fire on the same transaction id → short-circuits
 *      because matched_journal_entry_id is set.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { loadAccountingRefs } from '../packages/db/src/index'
import {
  bankReconciliationAgent,
  parseMemoCode,
  memoCodeFor,
  AUTO_POST_CONFIDENCE_FLOOR,
} from '../packages/workflows/src/index'
import { MEMO_PARSE_CASES } from '../packages/workflows/src/W18-bank-reconciliation/eval'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-bank-rec] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-bank-rec-harness'

type Db = SupabaseClient<Database>

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
  unitId: string
  fiscalPeriodId: string
  bankAccountId: string
  fundOperating: string
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Pure-function memo parser tests — no DB.
  testMemoParser()
  testMemoCodeFor()

  // 2-6. End-to-end DB scenarios.
  const fixture = await loadFixture(db)
  console.log(`\n[test-bank-rec] assoc=${fixture.associationId} bank_acct=${fixture.bankAccountId}`)
  try {
    await testStepAAutoMatch(db, fixture)
    await testStepAMemoOkAmountWrong(db, fixture)
    await testStepBFuzzy(db, fixture)
    await testStepDOutbound(db, fixture)
    await testIdempotentRefire(db, fixture)
  } finally {
    await cleanup(db, fixture)
  }

  console.log(`\n[test-bank-rec] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── 1. parser ───────────────────────────────────────────────────────

function testMemoParser(): void {
  console.log('parseMemoCode (pure fn):')
  for (const c of MEMO_PARSE_CASES) {
    const got = parseMemoCode(c.memo)
    const ok =
      (got?.associationSlug ?? null) === c.expectedSlug &&
      (got?.unitNumber ?? null) === c.expectedUnit &&
      (got?.purpose ?? null) === c.expectedPurpose
    check(c.id, ok, ok ? '' : `got ${JSON.stringify(got)}`)
  }
}

// ─── 1b. memoCodeFor (inverse) ───────────────────────────────────────
//
// memoCodeFor is the inverse of parseMemoCode — it builds the canonical
// SLUG-UNIT-PURPOSE code that homeowners then quote on Zelle. Together
// with the parser cases above, these round-trip for free: any code we
// emit here should re-parse cleanly upstream.
function testMemoCodeFor(): void {
  console.log('\nmemoCodeFor (pure fn, inverse direction):')

  // 1. Madison Park-style: slug longer than 4 chars gets truncated, unit
  // number used verbatim, 'regular' → DUES.
  const c1 = memoCodeFor({
    associationSlug: 'MADISON-PARK',
    unitNumber: '1247',
    unitId: '00000000-0000-0000-0000-000000000000',
    assessmentType: 'regular',
  })
  check(
    'MADISON-PARK-1247-regular → MADI-1247-DUES',
    c1 === 'MADI-1247-DUES',
    `got ${c1}`,
  )

  // 2. Missing unit_number → derive 4-digit number from last 8 hex chars
  // of unit_id. 0x0000FFFF = 65535, 65535 % 10000 = 5535.
  const c2 = memoCodeFor({
    associationSlug: 'MP',
    unitNumber: null,
    unitId: 'abcdef01-0000-0000-0000-00000000ffff',
    assessmentType: 'late_fee',
  })
  check(
    'MP/null-unit/...0000ffff/late_fee → MP-5535-FEE',
    c2 === 'MP-5535-FEE',
    `got ${c2}`,
  )

  // 3. Slug too short after stripping non-letters → null. "M" is below
  // the 2-letter minimum.
  const c3 = memoCodeFor({
    associationSlug: 'M',
    unitNumber: '100',
    unitId: 'x',
    assessmentType: 'regular',
  })
  check('M (slug too short) → null', c3 === null, `got ${c3}`)

  // 4. Unit_number too short (2 digits) → fall back to deterministic hex
  // suffix. unitId ending in '0001' → 0x0001 = 1, padded to '0001'. Code
  // is in-grammar (SLUG-NNNN-PURPOSE).
  const c4 = memoCodeFor({
    associationSlug: 'MP',
    unitNumber: '12',
    unitId: '00000000-0000-0000-0000-000000000001',
    assessmentType: 'regular',
  })
  check(
    'MP/12/...0001/regular → MP-0001-DUES (4-digit hex fallback)',
    c4 === 'MP-0001-DUES',
    `got ${c4}`,
  )

  // 5. Unknown assessment_type → null (PURPOSE_FOR_TYPE only knows
  // regular / late_fee / fine / special).
  const c5 = memoCodeFor({
    associationSlug: 'MP',
    unitNumber: '1247',
    unitId: '00000000-0000-0000-0000-000000000000',
    assessmentType: 'unknown_type',
  })
  check('unknown assessment_type → null', c5 === null, `got ${c5}`)
}

// ─── 2. Step A auto-match ────────────────────────────────────────────

async function testStepAAutoMatch(db: Db, f: Fixture): Promise<void> {
  console.log('\nStep A — exact memo + amount → auto-post:')

  // 1. Seed an open assessment with a known memo_code, amount $345.
  const memoCode = await makeUniqueMemoCode(db, f.associationId, 'DUES')
  const amount = 345
  const { data: assess } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'regular',
      amount,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: memoCode,
      status: 'open',
    })
    .select('id')
    .single()
  if (!assess) {
    check('seed assessment', false)
    return
  }
  check('seed assessment', true)

  // 2. Insert a matching bank_transaction.
  const txnId = await insertTxn(db, f, {
    amount,
    memo: `ZELLE PAYMENT FROM RESIDENT MEMO: ${memoCode} THANKS`,
    merchant: null,
  })

  // 3. Invoke W18.
  const result = await bankReconciliationAgent.execute(
    { bankTransactionId: txnId },
    { organizationId: f.organizationId },
  )
  check('matchMethod=auto_exact', result.output.matchMethod === 'auto_exact')
  check(
    'confidence at/above auto-post floor',
    (result.output.confidence ?? 0) >= AUTO_POST_CONFIDENCE_FLOOR,
    `got ${result.output.confidence}`,
  )
  check('matchedAssessmentId set', result.output.matchedAssessmentId === assess.id)
  check('matchedJournalEntryId set', !!result.output.matchedJournalEntryId)

  // 4. Verify side effects.
  const { data: txnRow } = await db
    .from('bank_transactions')
    .select('matched_journal_entry_id, match_method, match_confidence')
    .eq('id', txnId)
    .single()
  check('bank_transactions.matched_journal_entry_id set', !!txnRow?.matched_journal_entry_id)
  check('bank_transactions.match_method=auto_exact', txnRow?.match_method === 'auto_exact')

  const { data: assessAfter } = await db
    .from('assessments')
    .select('status')
    .eq('id', assess.id)
    .single()
  check('assessments.status=paid', assessAfter?.status === 'paid')

  const { data: zRow } = await db
    .from('zelle_inbound_matches')
    .select('status, memo_code, matched_assessment_id')
    .eq('bank_transaction_id', txnId)
    .single()
  check('zelle_inbound_matches.status=matched', zRow?.status === 'matched')
  check('zelle_inbound_matches.memo_code', zRow?.memo_code === memoCode)

  const { data: pay } = await db
    .from('payments')
    .select('amount, payment_method, journal_entry_id, external_ref')
    .eq('assessment_id', assess.id)
    .single()
  check('payments row created', !!pay && pay.journal_entry_id === result.output.matchedJournalEntryId)
}

// ─── 3. Memo code matches, amount doesn't ───────────────────────────

async function testStepAMemoOkAmountWrong(db: Db, f: Fixture): Promise<void> {
  console.log('\nStep A — memo right, amount wrong → no auto-post, audit row written:')

  const memoCode = await makeUniqueMemoCode(db, f.associationId, 'DUES')
  const { data: assess } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'regular',
      amount: 200,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: memoCode,
      status: 'open',
    })
    .select('id')
    .single()
  if (!assess) return

  const txnId = await insertTxn(db, f, {
    amount: 999, // far outside ±$0.50 of 200
    memo: memoCode,
    merchant: null,
  })

  const result = await bankReconciliationAgent.execute(
    { bankTransactionId: txnId },
    { organizationId: f.organizationId },
  )
  check(
    'matchMethod NOT auto_exact',
    result.output.matchMethod !== 'auto_exact',
    `got ${result.output.matchMethod}`,
  )

  // A 'status=unmatched' audit row should be written so the manager can
  // see "the memo code resolved but the amount didn't" — that's the
  // mismatch case worth surfacing.
  const { data: zRows } = await db
    .from('zelle_inbound_matches')
    .select('status, memo_code')
    .eq('bank_transaction_id', txnId)
  check(
    'zelle_inbound_matches audit row written with status=unmatched',
    !!zRows && zRows.length === 1 && zRows[0].status === 'unmatched',
  )
}

// ─── 4. Step B fuzzy ─────────────────────────────────────────────────

async function testStepBFuzzy(db: Db, f: Fixture): Promise<void> {
  console.log('\nStep B — malformed memo, amount within fuzzy tolerance → queue:')

  // Seed an open assessment for $300 with no memo_code.
  const { data: assess } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'regular',
      amount: 300,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: `${HARNESS_TAG}-stepB`,
      status: 'open',
    })
    .select('id')
    .single()
  if (!assess) return

  const txnId = await insertTxn(db, f, {
    amount: 305, // within 5% of 300
    memo: 'thanks for the help', // matches the 'no-code' parser case
    merchant: null,
  })

  const result = await bankReconciliationAgent.execute(
    { bankTransactionId: txnId },
    { organizationId: f.organizationId },
  )
  check(
    'matchMethod=auto_fuzzy',
    result.output.matchMethod === 'auto_fuzzy',
    `got ${result.output.matchMethod}`,
  )
  check(
    'confidence below auto-post floor',
    (result.output.confidence ?? 1) < AUTO_POST_CONFIDENCE_FLOOR,
    `got ${result.output.confidence}`,
  )
  check('matchedAssessmentId hinted', result.output.matchedAssessmentId === assess.id)
  check('no JE auto-posted', result.output.matchedJournalEntryId === null)

  // The run should be flagged pending_human_approval (status returned
  // by execute()).
  check(
    'run flagged pending_human_approval',
    result.status === 'pending_human_approval',
    `got ${result.status}`,
  )
}

// ─── 5. Step D outbound ──────────────────────────────────────────────

async function testStepDOutbound(db: Db, f: Fixture): Promise<void> {
  console.log('\nStep D — outbound payment, no recognizable target → queue:')

  const txnId = await insertTxn(db, f, {
    amount: -87.34, // outbound
    memo: null,
    merchant: 'HOME DEPOT #1234',
  })

  const result = await bankReconciliationAgent.execute(
    { bankTransactionId: txnId },
    { organizationId: f.organizationId },
  )
  check('matchMethod=unmatched', result.output.matchMethod === 'unmatched')
  // With LLM Step D wired (FU-5), confidence may be 0.2/0.4/0.6 if the
  // model returns a suggestion. The contract that matters: never at or
  // above the auto-post floor.
  check(
    'confidence below auto-post floor',
    (result.output.confidence ?? 1) < AUTO_POST_CONFIDENCE_FLOOR,
    `got ${result.output.confidence}`,
  )
  check('no JE posted', result.output.matchedJournalEntryId === null)
  check('queued for human', result.status === 'pending_human_approval')
}

// ─── 6. Idempotent re-fire ───────────────────────────────────────────

async function testIdempotentRefire(db: Db, f: Fixture): Promise<void> {
  console.log('\nIdempotent re-fire on an already-matched txn:')

  // Pick the Step A txn from earlier — find by harness tag.
  const { data: rows } = await db
    .from('bank_transactions')
    .select('id, matched_journal_entry_id')
    .eq('bank_account_id', f.bankAccountId)
    .like('memo', '%ZELLE%')
    .not('matched_journal_entry_id', 'is', null)
    .limit(1)

  const txn = rows?.[0]
  if (!txn) {
    check('re-fire fixture present', false, 'no auto-matched txn found')
    return
  }

  const result = await bankReconciliationAgent.execute(
    { bankTransactionId: txn.id },
    { organizationId: f.organizationId },
  )
  check('short-circuits to duplicate_je', result.output.matchMethod === 'duplicate_je')
  check(
    'links to same JE',
    result.output.matchedJournalEntryId === txn.matched_journal_entry_id,
  )
}

// ─── helpers ─────────────────────────────────────────────────────────

async function insertTxn(
  db: Db,
  f: Fixture,
  input: { amount: number; memo: string | null; merchant: string | null },
): Promise<string> {
  const { data, error } = await db
    .from('bank_transactions')
    .insert({
      organization_id: f.organizationId,
      bank_account_id: f.bankAccountId,
      amount: input.amount,
      posted_date: new Date().toISOString().slice(0, 10),
      memo: input.memo,
      merchant: input.merchant,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`insertTxn: ${error?.message}`)
  return data.id
}

async function makeUniqueMemoCode(
  db: Db,
  associationId: string,
  purpose: 'DUES' | 'FEE' | 'FINE' | 'ASSESS',
): Promise<string> {
  // Read assoc slug to keep parser-compatible.
  const { data: a } = await db
    .from('associations')
    .select('slug')
    .eq('id', associationId)
    .single()
  const slug = (a?.slug ?? 'MP').toUpperCase()
  // 4-digit random; collisions are unlikely in a test run (~0.01% per pair).
  const unit = String(Math.floor(1000 + Math.random() * 9000))
  return `${slug.slice(0, 4)}-${unit}-${purpose}`
}

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
  if (!assoc) throw new Error('no HOA association found — run pnpm seed:accounting')

  const [units, period, refs] = await Promise.all([
    db.from('units').select('id').eq('association_id', assoc.id).limit(1),
    db
      .from('fiscal_periods')
      .select('id')
      .eq('association_id', assoc.id)
      .eq('status', 'open')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadAccountingRefs(db, assoc.id),
  ])
  const unit = units.data?.[0]
  if (!unit) throw new Error(`no units in association ${assoc.id}`)
  if (!period.data) throw new Error('no open fiscal period')
  if (!refs) throw new Error('accounting refs missing')

  // Ensure the harness has a bank_account to attach to. Re-uses an
  // existing one tagged by this harness if present.
  const { data: existing } = await db
    .from('bank_accounts')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('account_name', `${HARNESS_TAG}-bank`)
    .maybeSingle()

  let bankAccountId = existing?.id
  if (!bankAccountId) {
    const { data: created, error } = await db
      .from('bank_accounts')
      .insert({
        organization_id: assoc.organization_id,
        association_id: assoc.id,
        fund_id: refs.fundOperating,
        account_name: `${HARNESS_TAG}-bank`,
        bank_name: 'Test Bank',
        last4: '0000',
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(`bank_account insert: ${error?.message}`)
    bankAccountId = created.id
  }

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    unitId: unit.id,
    fiscalPeriodId: period.data.id,
    bankAccountId,
    fundOperating: refs.fundOperating,
  }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // Everything tagged by this harness — assessments by memo_code prefix,
  // transactions by bank_account_id, JEs by ai_workflow_id, audit rows
  // cascade with their FK parents.
  const { data: txns } = await db
    .from('bank_transactions')
    .select('id')
    .eq('bank_account_id', f.bankAccountId)
  const txnIds = (txns ?? []).map((r) => r.id)

  if (txnIds.length > 0) {
    // zelle_inbound_matches cascade with bank_transactions ON DELETE CASCADE.
    await db.from('bank_transactions').delete().in('id', txnIds)
  }

  // JEs the workflow auto-posted.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .in('ai_workflow_id', ['W18'])
  const jeIds = (jes ?? []).map((r) => r.id)
  if (jeIds.length > 0) {
    // payments.journal_entry_id is ON DELETE SET NULL, so deleting JEs
    // is safe; but we delete the payments first via the assessments below.
  }

  // Assessments seeded by the harness — tagged with HARNESS-prefixed
  // memo_codes, or random codes whose payments link back to a seeded
  // assessment. Easiest: delete every assessment for this association
  // whose memo_code starts with one of our harness tags OR matches the
  // SLUG-NNNN-PURPOSE format we minted on the fly. To avoid scope creep
  // we drop only the rows whose memo_code starts with HARNESS_TAG and
  // those whose payments reference one of the JEs we just identified.
  if (jeIds.length > 0) {
    const { data: payRows } = await db
      .from('payments')
      .select('assessment_id')
      .in('journal_entry_id', jeIds)
    const assessIds = Array.from(
      new Set((payRows ?? []).map((r) => r.assessment_id).filter((x): x is string => !!x)),
    )
    if (assessIds.length > 0) {
      await db.from('payments').delete().in('assessment_id', assessIds)
      await db.from('assessments').delete().in('id', assessIds)
    }
  }

  await db
    .from('assessments')
    .delete()
    .eq('association_id', f.associationId)
    .like('memo_code', `${HARNESS_TAG}%`)

  if (jeIds.length > 0) {
    await db.from('journal_entries').delete().in('id', jeIds)
  }

  // The bank_account itself stays — harness reuses it across runs.
  console.log(
    `\n[test-bank-rec] cleaned up ${txnIds.length} txn(s), ${jeIds.length} JE(s)`,
  )
}

main().catch((err) => {
  console.error('[test-bank-rec] crashed:', err)
  process.exit(1)
})
