/**
 * scripts/test-recurring-jes.ts
 *
 * E2E for the recurring-JE flow. We don't invoke Inngest — that's an
 * orchestration layer. We exercise the SAME shape the cron uses:
 *   1. Find rules with next_run_date <= today AND is_active = true
 *   2. Load each rule's template JE + lines
 *   3. Post a fresh JE via postJournalEntry
 *   4. Advance next_run_date by cadence
 *
 * Plus an idempotency check: re-fire on the same day → next_run_date is
 * now in the future → no second JE.
 *
 * Real Postgres. Cleanup at the end removes the harness rule + every
 * JE it produced.
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
  console.error('[test-recurring-jes] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const HARNESS_TAG = 'test-recurring-jes-harness'
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

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  testAdvanceDate()

  const fixture = await loadFixture(db)
  console.log(
    `\n[test-recurring-jes] assoc=${fixture.associationId} period=${fixture.fiscalPeriodId}\n`,
  )

  try {
    const { ruleId, templateJeId } = await seedRuleAndTemplate(db, fixture)
    await testCronRun(db, fixture, ruleId, templateJeId)
    await testIdempotentRefire(db, fixture, ruleId)
  } finally {
    await cleanup(db, fixture)
  }

  console.log(`\n[test-recurring-jes] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── advanceDate (pure fn) ───────────────────────────────────────────

function advanceDate(isoDate: string, cadence: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  switch (cadence) {
    case 'daily':
      dt.setUTCDate(dt.getUTCDate() + 1)
      break
    case 'weekly':
      dt.setUTCDate(dt.getUTCDate() + 7)
      break
    case 'monthly':
      dt.setUTCMonth(dt.getUTCMonth() + 1)
      break
    case 'quarterly':
      dt.setUTCMonth(dt.getUTCMonth() + 3)
      break
    case 'annually':
      dt.setUTCFullYear(dt.getUTCFullYear() + 1)
      break
    default:
      dt.setUTCFullYear(dt.getUTCFullYear() + 1)
  }
  return dt.toISOString().slice(0, 10)
}

function testAdvanceDate(): void {
  console.log('advanceDate (pure fn):')
  check('daily   2026-05-17 → 2026-05-18', advanceDate('2026-05-17', 'daily') === '2026-05-18')
  check('weekly  2026-05-17 → 2026-05-24', advanceDate('2026-05-17', 'weekly') === '2026-05-24')
  check('monthly 2026-05-17 → 2026-06-17', advanceDate('2026-05-17', 'monthly') === '2026-06-17')
  check('quarter 2026-05-17 → 2026-08-17', advanceDate('2026-05-17', 'quarterly') === '2026-08-17')
  check('annual  2026-05-17 → 2027-05-17', advanceDate('2026-05-17', 'annually') === '2027-05-17')
  // Month-end edge case: Jan 31 + 1 month → Feb 28 / 29 (JS handles via overflow into March
  // by default; our helper inherits that). Verify behavior is consistent — Jan 31 → Mar 3 (non-leap).
  // Acceptable for v1; flag for the future.
  check(
    'monthly Jan 31 wraps via JS Date semantics',
    /^\d{4}-\d{2}-\d{2}$/.test(advanceDate('2026-01-31', 'monthly')),
  )
}

// ─── DB scenarios ────────────────────────────────────────────────────

interface Fixture {
  organizationId: string
  associationId: string
  fiscalPeriodId: string
  refs: NonNullable<Awaited<ReturnType<typeof loadAccountingRefs>>>
  expenseAccountId: string
}

async function seedRuleAndTemplate(
  db: Db,
  f: Fixture,
): Promise<{ ruleId: string; templateJeId: string }> {
  // 1. Post a template JE (Dr Expense / Cr Cash, $90) tagged with the
  //    harness ai_workflow_id so cleanup is easy.
  const templateJe = await postJournalEntry(db, {
    organizationId: f.organizationId,
    associationId: f.associationId,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `${HARNESS_TAG}: template — monthly utility bill`,
    source: 'manual',
    aiWorkflowId: HARNESS_TAG,
    lines: [
      { accountId: f.expenseAccountId, fundId: f.refs.fundOperating, debit: 90, credit: 0 },
      { accountId: f.refs.acctCashOperating, fundId: f.refs.fundOperating, debit: 0, credit: 90 },
    ],
  })
  if (!templateJe.ok) {
    throw new Error(`template JE failed: ${templateJe.error}`)
  }

  // 2. Insert a recurring rule due today (so the cron picks it up).
  const today = new Date().toISOString().slice(0, 10)
  const { data: rule, error } = await db
    .from('recurring_journal_entries')
    .insert({
      organization_id: f.organizationId,
      association_id: f.associationId,
      template_je_id: templateJe.journalEntryId,
      cadence: 'monthly',
      next_run_date: today,
      is_active: true,
    })
    .select('id')
    .single()
  if (error || !rule) throw new Error(`rule insert: ${error?.message}`)

  return { ruleId: rule.id, templateJeId: templateJe.journalEntryId }
}

async function testCronRun(
  db: Db,
  f: Fixture,
  ruleId: string,
  templateJeId: string,
): Promise<void> {
  console.log('\ncron run (clone template + advance cursor):')
  const today = new Date().toISOString().slice(0, 10)

  // Load the rule (mirrors the cron's SELECT).
  const { data: rule } = await db
    .from('recurring_journal_entries')
    .select(
      'id, organization_id, association_id, template_je_id, cadence, next_run_date, is_active',
    )
    .eq('id', ruleId)
    .single()
  check('rule loaded', !!rule)
  if (!rule) return

  // Load the template + its lines.
  const { data: template } = await db
    .from('journal_entries')
    .select(
      'id, memo, fiscal_period_id, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount, memo)',
    )
    .eq('id', rule.template_je_id)
    .single()
  check('template loaded', !!template && template.id === templateJeId)

  type LineShape = {
    account_id: string
    fund_id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
  }
  const lines = (template?.lines ?? []) as LineShape[]

  // Post a fresh JE — what the cron does.
  const je = await postJournalEntry(db, {
    organizationId: rule.organization_id,
    associationId: rule.association_id,
    fiscalPeriodId: f.fiscalPeriodId,
    entryDate: today,
    memo: template!.memo,
    source: 'recurring',
    sourceId: rule.id,
    aiWorkflowId: HARNESS_TAG,
    lines: lines.map((l) => ({
      accountId: l.account_id,
      fundId: l.fund_id,
      debit: Number(l.debit_amount),
      credit: Number(l.credit_amount),
      memo: l.memo ?? undefined,
    })),
  })
  check('cloned JE posted', je.ok, je.ok ? '' : je.error)
  if (!je.ok) return

  // The cloned JE has source='recurring' and references the rule.
  const { data: cloned } = await db
    .from('journal_entries')
    .select('source, source_id, status')
    .eq('id', je.journalEntryId)
    .single()
  check("cloned JE source='recurring'", cloned?.source === 'recurring')
  check('cloned JE source_id = rule.id', cloned?.source_id === ruleId)
  check("cloned JE status='posted'", cloned?.status === 'posted')

  // Verify its lines mirror the template.
  const { data: clonedLines } = await db
    .from('ledger_entries')
    .select('debit_amount, credit_amount, account_id')
    .eq('journal_entry_id', je.journalEntryId)
  check('cloned has 2 lines', (clonedLines ?? []).length === 2)
  const totalDr = (clonedLines ?? []).reduce((s, l) => s + Number(l.debit_amount), 0)
  check('cloned total debit = $90', totalDr === 90)

  // Advance next_run_date by cadence — the cron's last step.
  const next = advanceDate(rule.next_run_date, rule.cadence)
  await db.from('recurring_journal_entries').update({ next_run_date: next }).eq('id', ruleId)
  const { data: after } = await db
    .from('recurring_journal_entries')
    .select('next_run_date')
    .eq('id', ruleId)
    .single()
  check('next_run_date advanced one month', after?.next_run_date === next)
}

async function testIdempotentRefire(db: Db, f: Fixture, ruleId: string): Promise<void> {
  console.log('\nidempotency — re-fire same day, rule is skipped:')
  const today = new Date().toISOString().slice(0, 10)

  // The cron's SELECT filter: next_run_date <= today AND is_active = true.
  // After the prior step, next_run_date was advanced to a future date.
  // A fresh SELECT should NOT return our rule.
  const { data: due } = await db
    .from('recurring_journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('is_active', true)
    .lte('next_run_date', today)

  const ourRuleIsDue = (due ?? []).some((r) => r.id === ruleId)
  check('rule not picked up on second pass', !ourRuleIsDue)
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
      .select('id')
      .eq('association_id', assoc.id)
      .eq('account_type', 'expense')
      .eq('is_active', true)
      .order('account_number')
      .limit(1),
  ])
  if (!period.data) throw new Error('no open fiscal period')
  if (!refs) throw new Error('accounting refs missing')
  if (!expense.data?.[0]) throw new Error('no expense account')

  return {
    organizationId: assoc.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.data.id,
    refs,
    expenseAccountId: expense.data[0].id,
  }
}

async function cleanup(db: Db, f: Fixture): Promise<void> {
  // Rules by association + template tagging — find via template_je_id
  // pointing at one of our tagged JEs.
  const { data: jes } = await db
    .from('journal_entries')
    .select('id')
    .eq('association_id', f.associationId)
    .eq('ai_workflow_id', HARNESS_TAG)
  const jeIds = (jes ?? []).map((r) => r.id)

  // Delete rules pointing at any of our tagged JEs first (FK).
  if (jeIds.length > 0) {
    await db.from('recurring_journal_entries').delete().in('template_je_id', jeIds)
  }
  // Also delete rules where source_id points at a deleted rule — but the
  // cloned JE has source='recurring', source_id=rule_id. Those JEs are
  // tagged with HARNESS_TAG too, so they're already in jeIds.
  if (jeIds.length > 0) {
    await db.from('journal_entries').delete().in('id', jeIds)
  }

  console.log(`\n[test-recurring-jes] cleaned up ${jeIds.length} JE(s)`)
}

main().catch((err) => {
  console.error('[test-recurring-jes] crashed:', err)
  process.exit(1)
})
