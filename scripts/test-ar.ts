/**
 * scripts/test-ar.ts
 *
 * End-to-end verification of the Phase 3 AR cutover. Hits real Postgres,
 * exercises the full flow: assess → pay → late-fee. No mocks — the trigger
 * + RLS + AR cascade are exactly what we want to verify.
 *
 * Pattern matches test-accounting.ts (the JE-composer harness). Distinct
 * from that script because the AR flow runs through the server-action
 * code paths in apps/hoa, not the composer in isolation.
 *
 * The script intentionally pokes the same internal functions the UI
 * calls: postJournalEntry + loadAccountingRefs from @homeowner-portal/db,
 * plus raw inserts that mirror what apps/hoa/src/lib/assessments.ts
 * does. We don't import the server-action module here because it depends
 * on next/cache (revalidatePath), getSupabaseServerClient (cookies), and
 * getCurrentOrg (RLS-scoped auth) — none of which exist in a CLI.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-ar.ts
 *   SEED_ORG_NAME="Madison Park HOA" pnpm exec tsx scripts/test-ar.ts
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
  console.error('[test-ar] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

type Db = SupabaseClient<Database>

const HARNESS_TAG = 'test-ar-harness'

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
  refs: NonNullable<Awaited<ReturnType<typeof loadAccountingRefs>>>
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(
    `[test-ar] assoc=${fixture.associationId} unit=${fixture.unitId} period=${fixture.fiscalPeriodId}\n`,
  )

  const assessmentIds: string[] = []
  try {
    const regularId = await testMaterializeAssessment(db, fixture)
    if (regularId) assessmentIds.push(regularId)

    if (regularId) {
      await testMarkPaid(db, fixture, regularId)
    }

    const lateFeeId = await testLateFee(db, fixture)
    if (lateFeeId) assessmentIds.push(lateFeeId)
  } finally {
    await cleanup(db, fixture.associationId, assessmentIds)
  }

  console.log(`\n[test-ar] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── tests ───────────────────────────────────────────────────────────

async function testMaterializeAssessment(
  db: Db,
  f: Fixture,
): Promise<string | null> {
  console.log('materialize: assessment + Dr AR / Cr Assessment Income:')

  const amount = 250
  const { data: assessment, error: aErr } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'regular',
      amount,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: HARNESS_TAG,
      status: 'open',
    })
    .select('id')
    .single()

  if (aErr || !assessment) {
    check('insert assessment', false, aErr?.message)
    return null
  }
  check('insert assessment', true)

  const je = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `harness: assessment billed (${assessment.id.slice(0, 8)})`,
    source: 'ar_payment',
    sourceId: assessment.id,
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctAR, fundId: f.refs.fundOperating, debit: amount, credit: 0 },
      { accountId: f.refs.acctAssessmentIncome, fundId: f.refs.fundOperating, debit: 0, credit: amount },
    ],
  })
  check('post AR/Income JE', je.ok, je.ok ? '' : je.error)
  return assessment.id
}

async function testMarkPaid(
  db: Db,
  f: Fixture,
  assessmentId: string,
): Promise<void> {
  console.log('mark paid: payment row + Dr Cash / Cr AR:')

  const amount = 250
  const paidAt = new Date().toISOString()

  const { data: payment, error: pErr } = await db
    .from('payments')
    .insert({
      organization_id: f.organizationId,
      unit_id: f.unitId,
      assessment_id: assessmentId,
      amount,
      payment_method: 'other',
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
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: paidAt.slice(0, 10),
    memo: `harness: payment received (${payment.id.slice(0, 8)})`,
    source: 'ar_payment',
    sourceId: payment.id,
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: amount, credit: 0 },
      { accountId: f.refs.acctAR, fundId: f.refs.fundOperating, debit: 0, credit: amount },
    ],
  })
  check('post Cash/AR JE', je.ok, je.ok ? '' : je.error)
  if (!je.ok) return

  // Link the JE back, like the server action does.
  const { error: linkErr } = await db
    .from('payments')
    .update({ journal_entry_id: je.journalEntryId })
    .eq('id', payment.id)
  check('payment links to JE', !linkErr, linkErr?.message)

  const { error: updErr } = await db
    .from('assessments')
    .update({ status: 'paid' })
    .eq('id', assessmentId)
  check("assessment status → 'paid'", !updErr, updErr?.message)

  // Verify: trial balance should still zero out. Sum debits and credits
  // across just this harness's JEs for this period.
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
}

async function testLateFee(db: Db, f: Fixture): Promise<string | null> {
  console.log('late fee: backdated assessment + cron logic:')

  // 1. Insert a regular assessment with due_date in the past.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const principalAmount = 200
  const { data: regular, error: aErr } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'regular',
      amount: principalAmount,
      due_date: yesterday,
      memo_code: `${HARNESS_TAG}-overdue`,
      status: 'open',
    })
    .select('id')
    .single()
  if (aErr || !regular) {
    check('insert defaulted assessment', false, aErr?.message)
    return null
  }
  check('insert defaulted assessment', true)

  const memoCode = `LATE-${regular.id}`
  const feeAmount = Math.round(principalAmount * 0.05 * 100) / 100

  // 2. Simulate the cron: insert late-fee assessment.
  const { data: lateFee, error: lErr } = await db
    .from('assessments')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      unit_id: f.unitId,
      fiscal_period_id: f.fiscalPeriodId,
      assessment_type: 'late_fee',
      amount: feeAmount,
      due_date: new Date().toISOString().slice(0, 10),
      memo_code: memoCode,
      status: 'open',
    })
    .select('id')
    .single()
  if (lErr || !lateFee) {
    check('insert late_fee', false, lErr?.message)
    return null
  }
  check('insert late_fee', true)

  // 3. JE for the late fee.
  const je = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Late fee: ${memoCode}`,
    source: 'recurring',
    sourceId: lateFee.id,
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.refs.acctAR, fundId: f.refs.fundOperating, debit: feeAmount, credit: 0 },
      { accountId: f.refs.acctLateFeeIncome, fundId: f.refs.fundOperating, debit: 0, credit: feeAmount },
    ],
  })
  check('post late-fee JE', je.ok, je.ok ? '' : je.error)

  // 4. Idempotency: a second cron run should detect the existing
  //    memo_code and not insert again. Simulate by checking the query
  //    the cron uses.
  const { data: existing } = await db
    .from('assessments')
    .select('memo_code')
    .eq('association_id', f.associationId)
    .eq('assessment_type', 'late_fee')
    .eq('memo_code', memoCode)
  check(
    'idempotency lookup finds existing late_fee',
    (existing ?? []).length === 1,
    `found ${existing?.length} rows`,
  )

  return regular.id
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
  if (!assoc) throw new Error('no HOA association found — run pnpm seed:accounting first')

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
  if (!unit) throw new Error(`no units in association ${assoc.id} — add at least one`)
  if (!period.data) throw new Error('no open fiscal period — run pnpm seed:accounting')
  if (!refs) throw new Error('accounting refs missing — run pnpm seed:accounting')

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    unitId: unit.id,
    fiscalPeriodId: period.data.id,
    refs,
  }
}

async function cleanup(
  db: Db,
  associationId: string,
  assessmentIds: string[],
): Promise<void> {
  // JEs tagged by this harness.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', associationId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const jeIds = (jes ?? []).map((r) => r.id)

  // Payments tied to harness assessments. Done before deleting JEs
  // because payments has FK -> journal_entries (ON DELETE SET NULL,
  // not CASCADE), so this is just tidy ordering.
  if (assessmentIds.length > 0) {
    await db.from('payments').delete().in('assessment_id', assessmentIds)
  }

  if (jeIds.length > 0) {
    await db.from('journal_entries').delete().in('id', jeIds) // ledger_entries cascade
  }

  // Any assessment marked with the harness tag in memo_code (including
  // the late_fee LATE-<id> we just made — its source is in the list).
  await db
    .from('assessments')
    .delete()
    .eq('association_id', associationId)
    .or(
      [
        `memo_code.eq.${HARNESS_TAG}`,
        `memo_code.eq.${HARNESS_TAG}-overdue`,
        ...assessmentIds.map((id) => `memo_code.eq.LATE-${id}`),
      ].join(','),
    )

  console.log(
    `\n[test-ar] cleaned up ${jeIds.length} JE(s), ${assessmentIds.length} source assessment(s)`,
  )
}

main().catch((err) => {
  console.error('[test-ar] crashed:', err)
  process.exit(1)
})
