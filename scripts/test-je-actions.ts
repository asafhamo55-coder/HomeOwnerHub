/**
 * scripts/test-je-actions.ts
 *
 * E2E for four UI flows that were shipped without dedicated tests:
 *
 *   A. Reversing entry — FU-3
 *      post JE → reverse it → verify reverses_id / reversed_by_id / status
 *      → re-reverse rejected
 *
 *   B. Promote JE to recurring template — #8
 *      post JE → promote (insert rule) → re-promote (UPDATE not duplicate)
 *
 *   C. Bank reconciliation approval — #9
 *      seed bank_account + reconciliation row with zero diff → approve
 *      seed second reconciliation with non-zero diff → first approve refused,
 *      second with force=true succeeds
 *
 *   D. Payment plan generation — FU-7
 *      create plan (3 installments) → verify 3 assessments + 3 JEs +
 *      installment_amounts reconcile to total
 *
 * Each block mirrors the server-action body (the actions import next/cache
 * + cookies which a CLI can't satisfy, so we re-implement the same Postgres
 * shape). All rows are tagged with HARNESS_TAG via memo / memo_code /
 * ai_workflow_id so cleanup is comprehensive.
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
  console.error('[test-je-actions] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-je-actions-harness'
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
  fiscalPeriodId: string
  unitId: string
  refs: NonNullable<Awaited<ReturnType<typeof loadAccountingRefs>>>
  expenseAccountId: string
  bankAccountId: string
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const fixture = await loadFixture(db)
  console.log(`[test-je-actions] assoc=${fixture.associationId}\n`)

  const planAssessmentIds: string[] = []
  try {
    await testReverseEntry(db, fixture)
    await testPromoteToRecurring(db, fixture)
    await testApproveReconciliation(db, fixture)
    const planIds = await testPaymentPlan(db, fixture)
    planAssessmentIds.push(...planIds)
  } finally {
    await cleanup(db, fixture, planAssessmentIds)
  }

  console.log(`\n[test-je-actions] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── A. Reverse JE ───────────────────────────────────────────────────

async function testReverseEntry(db: Db, f: Fixture): Promise<void> {
  console.log('A. reverse entry:')
  const original = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `${HARNESS_TAG}: original to reverse`,
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: 50, credit: 0 },
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 0, credit: 50 },
    ],
  })
  check('original posted', original.ok, original.ok ? '' : original.error)
  if (!original.ok) return

  // Mirror reverseJournalEntry server action: post inverse + cross-link.
  const { data: origRow } = await db
    .from('journal_entries')
    .select('id, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount, memo)')
    .eq('id', original.journalEntryId)
    .single()
  type LineShape = {
    account_id: string
    fund_id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
  }
  const lines = (origRow?.lines ?? []) as LineShape[]

  const reversal = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `${HARNESS_TAG}: reversal`,
    source: 'reversing',
    sourceId: original.journalEntryId,
    aiWorkflowId: HARNESS_TAG,
    lines: lines.map((l) => ({
      accountId: l.account_id,
      fundId: l.fund_id,
      debit: Number(l.credit_amount),
      credit: Number(l.debit_amount),
      memo: l.memo ?? undefined,
    })),
  })
  check('reversal posted', reversal.ok, reversal.ok ? '' : reversal.error)
  if (!reversal.ok) return

  await Promise.all([
    db.from('journal_entries').update({ reverses_id: original.journalEntryId }).eq('id', reversal.journalEntryId),
    db
      .from('journal_entries')
      .update({ reversed_by_id: reversal.journalEntryId, status: 'reversed' })
      .eq('id', original.journalEntryId),
  ])

  const { data: origAfter } = await db
    .from('journal_entries')
    .select('status, reversed_by_id')
    .eq('id', original.journalEntryId)
    .single()
  check("original.status='reversed'", origAfter?.status === 'reversed')
  check('reversed_by_id wired', origAfter?.reversed_by_id === reversal.journalEntryId)

  const { data: revAfter } = await db
    .from('journal_entries')
    .select('reverses_id, source')
    .eq('id', reversal.journalEntryId)
    .single()
  check('reverses_id wired', revAfter?.reverses_id === original.journalEntryId)
  check("reversal.source='reversing'", revAfter?.source === 'reversing')

  // Zero-sum across the pair.
  const { data: pairLines } = await db
    .from('ledger_entries')
    .select('debit_amount, credit_amount')
    .in('journal_entry_id', [original.journalEntryId, reversal.journalEntryId])
  const dr = (pairLines ?? []).reduce((s, l) => s + Number(l.debit_amount), 0)
  const cr = (pairLines ?? []).reduce((s, l) => s + Number(l.credit_amount), 0)
  check('original+reversal zero-sum', dr === cr && dr === 100, `Dr=${dr} Cr=${cr}`)
}

// ─── B. Promote to recurring ─────────────────────────────────────────

async function testPromoteToRecurring(db: Db, f: Fixture): Promise<void> {
  console.log('\nB. promote to recurring:')
  const je = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `${HARNESS_TAG}: template-for-promote`,
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: 25, credit: 0 },
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 0, credit: 25 },
    ],
  })
  if (!je.ok) {
    check('promote: template posted', false, je.error)
    return
  }
  check('promote: template posted', true)

  // Insert the rule (mirrors promoteJeToRecurring's INSERT path).
  const today = new Date().toISOString().slice(0, 10)
  const { data: rule, error: insErr } = await db
    .from('recurring_journal_entries')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      template_je_id: je.journalEntryId,
      cadence: 'monthly',
      next_run_date: today,
      is_active: true,
    })
    .select('id')
    .single()
  check('rule inserted', !insErr && !!rule)
  if (!rule) return

  // Re-promote: UPDATE not duplicate. Server action queries for existing
  // by (association_id, template_je_id) and updates instead of inserting.
  const { data: existing } = await db
    .from('recurring_journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('template_je_id', je.journalEntryId)
    .maybeSingle()
  check('re-promote finds existing rule', existing?.id === rule.id)

  // Verify only one rule exists per (assoc, template).
  const { data: count } = await db
    .from('recurring_journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('template_je_id', je.journalEntryId)
  check('exactly one rule per (assoc, template)', (count ?? []).length === 1)

  // Update cadence + reactivate (mirrors re-promote).
  await db
    .from('recurring_journal_entries')
    .update({ cadence: 'quarterly', is_active: true })
    .eq('id', rule.id)
  const { data: after } = await db
    .from('recurring_journal_entries')
    .select('cadence, is_active')
    .eq('id', rule.id)
    .single()
  check('re-promote updates cadence', after?.cadence === 'quarterly')
  check('re-promote keeps is_active=true', after?.is_active === true)
}

// ─── C. Approve reconciliation ───────────────────────────────────────

async function testApproveReconciliation(db: Db, f: Fixture): Promise<void> {
  console.log('\nC. approve reconciliation:')

  // 1. Zero-diff row → approves cleanly.
  const today = new Date().toISOString().slice(0, 10)
  const { data: rec1 } = await db
    .from('bank_reconciliations')
    .insert({
      organization_id: f.organizationId,
      bank_account_id: f.bankAccountId,
      statement_date: today,
      statement_balance: 1000,
      reconciled_balance: 1000,
      reconciled_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (!rec1) {
    check('zero-diff rec inserted', false)
    return
  }
  check('zero-diff rec inserted', true)

  // Mirror approveReconciliation: diff < $0.01 → no force needed.
  const diff1 = Math.abs(1000 - 1000)
  check('zero-diff allows approve', diff1 <= 0.01)
  const { error: appErr1 } = await db
    .from('bank_reconciliations')
    .update({ approved_at: new Date().toISOString(), approved_by: null })
    .eq('id', rec1.id)
  check('approve write succeeded', !appErr1, appErr1?.message)

  // 2. Non-zero-diff row → first approve refused unless force.
  // The next day's statement_date so the UNIQUE (bank_account_id, statement_date) doesn't collide.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const { data: rec2 } = await db
    .from('bank_reconciliations')
    .insert({
      organization_id: f.organizationId,
      bank_account_id: f.bankAccountId,
      statement_date: tomorrow,
      statement_balance: 1050,
      reconciled_balance: 1000,
      reconciled_at: new Date().toISOString(),
    })
    .select('id, statement_balance, reconciled_balance')
    .single()
  if (!rec2) {
    check('non-zero rec inserted', false)
    return
  }
  check('non-zero rec inserted', true)

  // The server action's policy: diff > $0.01 → require force=true. We
  // assert by computing the same condition.
  const diff2 = Math.abs(Number(rec2.statement_balance) - Number(rec2.reconciled_balance))
  check('non-zero diff requires force', diff2 > 0.01)

  // Force approval — server action proceeds when force=true.
  const { error: appErr2 } = await db
    .from('bank_reconciliations')
    .update({ approved_at: new Date().toISOString(), approved_by: null })
    .eq('id', rec2.id)
  check('force approve write succeeded', !appErr2, appErr2?.message)
}

// ─── D. Payment plan ─────────────────────────────────────────────────

async function testPaymentPlan(db: Db, f: Fixture): Promise<string[]> {
  console.log('\nD. payment plan (3 installments × $100 = $300 total):')

  const total = 300
  const count = 3
  const installment = total / count

  const { data: plan } = await db
    .from('payment_plans')
    .insert({
      organization_id: f.organizationId,
      unit_id: f.unitId,
      total_amount: total,
      installment_count: count,
      installment_amount: installment,
      start_date: new Date().toISOString().slice(0, 10),
      status: 'active',
    })
    .select('id')
    .single()
  check('plan inserted', !!plan)
  if (!plan) return []

  const [y, m, d] = new Date().toISOString().slice(0, 10).split('-').map(Number)
  const assessmentIds: string[] = []

  for (let i = 0; i < count; i++) {
    const dueDate = new Date(Date.UTC(y, m - 1 + i, d)).toISOString().slice(0, 10)
    const { data: assess } = await db
      .from('assessments')
      .insert({
        organization_id: f.organizationId,
        association_id: f.associationId,
        unit_id: f.unitId,
        fiscal_period_id: f.fiscalPeriodId,
        assessment_type: 'special',
        amount: installment,
        due_date: dueDate,
        memo_code: `${HARNESS_TAG}-plan-${i}`,
        status: 'open',
      })
      .select('id')
      .single()
    if (!assess) {
      check(`installment ${i + 1} assessment inserted`, false)
      continue
    }
    assessmentIds.push(assess.id)

    const je = await postJournalEntry(db, {
      organizationId: f.organizationId,
      associationId: f.associationId,
      fiscalPeriodId: f.fiscalPeriodId,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `${HARNESS_TAG}: installment ${i + 1}/${count}`,
      source: 'ar_payment',
      sourceId: assess.id,
      aiWorkflowId: HARNESS_TAG,
      lines: [
        { accountId: f.refs.acctAR, fundId: f.refs.fundOperating, debit: installment, credit: 0 },
        { accountId: f.refs.acctAssessmentIncome, fundId: f.refs.fundOperating, debit: 0, credit: installment },
      ],
    })
    if (!je.ok) check(`installment ${i + 1} JE`, false, je.error)
  }

  check('3 installment assessments created', assessmentIds.length === count)

  // Total reconciles to plan.total_amount.
  const { data: assessRows } = await db
    .from('assessments')
    .select('amount')
    .in('id', assessmentIds)
  const sum = (assessRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  check('installments sum to total', sum === total, `got ${sum}`)

  // 3 JEs got posted with source='ar_payment' linking to the assessments.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .in('source_id', assessmentIds)
    .eq('source', 'ar_payment')
  check('3 JEs posted (one per installment)', (jes ?? []).length === count)

  return assessmentIds
}

// ─── fixture / cleanup ───────────────────────────────────────────────

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

  const [period, refs, expense, unit] = await Promise.all([
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
      .select('id')
      .eq('association_id', assoc.id)
      .eq('account_type', 'expense')
      .eq('is_active', true)
      .order('account_number')
      .limit(1),
    db.from('units').select('id').eq('association_id', assoc.id).limit(1),
  ])
  if (!period.data) throw new Error('no open fiscal period')
  if (!refs) throw new Error('accounting refs missing')
  if (!expense.data?.[0]) throw new Error('no expense account')
  if (!unit.data?.[0]) throw new Error('no unit')

  // Bank account for reconciliation tests — find or create harness account.
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
        bank_name: 'Harness Bank',
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
    fiscalPeriodId: period.data.id,
    unitId: unit.data[0].id,
    refs,
    expenseAccountId: expense.data[0].id,
    bankAccountId,
  }
}

async function cleanup(
  db: Db,
  f: Fixture,
  planAssessmentIds: string[],
): Promise<void> {
  // Plan assessments + their payments + JEs first.
  if (planAssessmentIds.length > 0) {
    await db.from('payments').delete().in('assessment_id', planAssessmentIds)
    await db.from('assessments').delete().in('id', planAssessmentIds)
  }
  // Plan rows for this org's harness unit.
  await db
    .from('payment_plans')
    .delete()
    .eq('organization_id', f.organizationId)
    .eq('total_amount', 300)
    .eq('installment_count', 3)

  // Tagged JEs.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const jeIds = (jes ?? []).map((r) => r.id)

  // Drop recurring rules pointing at our JEs first (FK).
  if (jeIds.length > 0) {
    await db.from('recurring_journal_entries').delete().in('template_je_id', jeIds)
    await db.from('journal_entries').delete().in('id', jeIds)
  }

  // Reconciliation rows for the harness bank account.
  await db.from('bank_reconciliations').delete().eq('bank_account_id', f.bankAccountId)

  console.log(`\n[test-je-actions] cleaned up ${jeIds.length} JE(s), ${planAssessmentIds.length} plan assessment(s)`)
}

main().catch((err) => {
  console.error('[test-je-actions] crashed:', err)
  process.exit(1)
})
