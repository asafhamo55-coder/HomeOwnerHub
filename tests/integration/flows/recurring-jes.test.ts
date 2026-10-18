/**
 * recurring-jes: the backlog-collapse and idempotency bug.
 *
 * recurringJeJob was wired into serve() today after sitting dormant since
 * it was written — this is its first real execution. Review (and one
 * production rule, 136 days stale) found it would post one misdated JE
 * per missed cadence period instead of collapsing the backlog, and that
 * nothing stopped a second same-day pass from posting again if the
 * next_run_date advance failed after the JE itself succeeded.
 *
 * Asserted against real Postgres: postJournalEntry's balance checks and
 * the validate_je_balances trigger are part of what's under test here,
 * not incidental plumbing a mock would skip past.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { postJournalEntry } from '../../../packages/db/src'
import { runRecurringJes, type RecurringJesStep } from '../../../packages/jobs/src/recurring-jes'
import { adminDb, makeAccounting, makeOrg, type OrgFixture, type AccountingRefs } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const TODAY = '2026-10-15'
/** Noon Eastern on TODAY: the factory's FL association is on TODAY (BL-065). */
const NOW = new Date('2026-10-15T16:00:00Z')

/** Steps execute inline, exactly once — see the same fake at
 *  ticket-notifications.test.ts:16-19. */
function inlineStep(): RecurringJesStep {
  return { run: async (_id, fn) => fn() }
}

function collectingLogger(): { warn(m: string): void; error(m: string): void; warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  return {
    warn: (m: string) => { warnings.push(m) },
    error: (m: string) => { errors.push(m) },
    warnings,
    errors,
  }
}

/** Posts a balanced template JE (Cash debit / Assessment Income credit)
 *  that the recurring rule will clone. */
async function seedTemplateJe(org: OrgFixture, acct: AccountingRefs, entryDate: string): Promise<string> {
  const je = await postJournalEntry(adminDb(), {
    organizationId: org.orgId,
    associationId: org.associationId,
    fiscalPeriodId: acct.fiscalPeriodId,
    entryDate,
    memo: 'Monthly dues template',
    source: 'manual',
    lines: [
      { accountId: acct.accountIds['1010'], fundId: acct.fundIds.OPERATING, debit: 100, credit: 0 },
      { accountId: acct.accountIds['4000'], fundId: acct.fundIds.OPERATING, debit: 0, credit: 100 },
    ],
  })
  if (!je.ok) throw new Error(`seedTemplateJe failed: ${je.error}`)
  return je.journalEntryId
}

async function seedRule(
  org: OrgFixture,
  templateJeId: string,
  cadence: string,
  nextRunDate: string,
): Promise<string> {
  const { data, error } = await adminDb()
    .from('recurring_journal_entries')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      template_je_id: templateJeId,
      cadence,
      next_run_date: nextRunDate,
      is_active: true,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedRule failed: ${error?.message}`)
  return data.id
}

async function countPostedJes(ruleId: string): Promise<number> {
  const { data } = await adminDb()
    .from('journal_entries')
    .select('id')
    .eq('source', 'recurring')
    .eq('source_id', ruleId)
  return (data ?? []).length
}

describe('recurring-jes', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  // The headline bug. next_run_date = 2026-06-01, monthly, run against
  // TODAY = 2026-10-15 — 136 days stale, same shape as the production
  // rule found during review. The old code advanced one cadence step
  // from the OLD value per night and never checked for an existing JE,
  // so a backlog this size would post once per night (not once total)
  // and date each posting the night it happened to run, not the rule's
  // own schedule.
  it('a stale rule posts exactly one JE, dated today, and advances to the next genuine future occurrence', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const templateId = await seedTemplateJe(org, acct, '2026-01-01')
    const ruleId = await seedRule(org, templateId, 'monthly', '2026-06-01')

    const logger = collectingLogger()
    const result = await runRecurringJes(adminDb(), inlineStep(), logger, NOW)

    expect(result.posted).toBe(1)
    expect(result.failed).toBe(0)

    const { data: jes } = await adminDb()
      .from('journal_entries')
      .select('entry_date')
      .eq('source', 'recurring')
      .eq('source_id', ruleId)
    expect(jes ?? [], 'a 136-day backlog posted more than one JE').toHaveLength(1)
    expect(jes?.[0]?.entry_date).toBe(TODAY)

    const { data: rule } = await adminDb()
      .from('recurring_journal_entries')
      .select('next_run_date')
      .eq('id', ruleId)
      .single()
    // Monthly from 2026-06-01, stepped forward whole months until
    // strictly after 2026-10-15: 07-01, 08-01, 09-01, 10-01 (still <=
    // today), 11-01 (> today) — the rule's own 1st-of-month anchor is
    // preserved, not shifted to today's day-of-month.
    expect(rule?.next_run_date).toBe('2026-11-01')
    expect(logger.errors).toEqual([])
  })

  it('a second run on the same day posts nothing, even if a prior advance failed to persist', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const templateId = await seedTemplateJe(org, acct, '2026-01-01')
    const ruleId = await seedRule(org, templateId, 'monthly', TODAY)

    // Simulate the exact failure mode defect #3 describes: the JE for
    // today already exists (a prior pass posted it) but next_run_date
    // was never advanced, so the rule is still due by the .lte filter.
    // The header comment used to claim the next_run_date advance alone
    // makes a same-day re-run a no-op; this is false precisely in this
    // case, which is why the guard checks journal_entries directly.
    await postJournalEntry(adminDb(), {
      organizationId: org.orgId,
      associationId: org.associationId,
      fiscalPeriodId: acct.fiscalPeriodId,
      entryDate: TODAY,
      memo: 'Monthly dues template',
      source: 'recurring',
      sourceId: ruleId,
      lines: [
        { accountId: acct.accountIds['1010'], fundId: acct.fundIds.OPERATING, debit: 100, credit: 0 },
        { accountId: acct.accountIds['4000'], fundId: acct.fundIds.OPERATING, debit: 0, credit: 100 },
      ],
    })

    const logger = collectingLogger()
    const result = await runRecurringJes(adminDb(), inlineStep(), logger, NOW)

    expect(result.posted).toBe(0)
    expect(result.failed).toBe(0)
    expect(await countPostedJes(ruleId), 'a same-day re-run posted a duplicate JE').toBe(1)

    // The guard still resolves the schedule even when it skips the post,
    // so the rule doesn't loop forever re-detecting the same JE. The rule
    // was due TODAY (2026-10-15), monthly, so the next occurrence past
    // today is one month out on the same day-of-month: 2026-11-15.
    const { data: rule } = await adminDb()
      .from('recurring_journal_entries')
      .select('next_run_date')
      .eq('id', ruleId)
      .single()
    expect(rule?.next_run_date).toBe('2026-11-15')
  })

  it('skips a rule whose next_run_date is in the future', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const templateId = await seedTemplateJe(org, acct, '2026-01-01')
    const ruleId = await seedRule(org, templateId, 'monthly', '2026-11-01')

    const result = await runRecurringJes(adminDb(), inlineStep(), collectingLogger(), NOW)

    expect(result.rules).toBe(0)
    expect(result.posted).toBe(0)
    expect(await countPostedJes(ruleId)).toBe(0)

    const { data: rule } = await adminDb()
      .from('recurring_journal_entries')
      .select('next_run_date')
      .eq('id', ruleId)
      .single()
    expect(rule?.next_run_date).toBe('2026-11-01')
  })

  // BL-081: Pause and Stop both turn is_active off; the job must not post.
  it('a paused or stopped rule posts nothing, even when due', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const templateId = await seedTemplateJe(org, acct, '2026-01-01')
    const ruleId = await seedRule(org, templateId, 'monthly', TODAY)
    await adminDb().from('recurring_journal_entries').update({ is_active: false }).eq('id', ruleId)

    const result = await runRecurringJes(adminDb(), inlineStep(), collectingLogger(), NOW)

    expect(result.rules).toBe(0)
    expect(await countPostedJes(ruleId)).toBe(0)
  })

  // BL-081: an edit points the rule at a DRAFT template (new amounts);
  // the job copies the draft's lines and posts them; the draft itself,
  // and the original posted template, stay exactly as they were.
  it('a rule whose template was edited posts the new lines and leaves both templates untouched', async () => {
    const org = await makeOrg()
    const acct = await makeAccounting(org)
    const originalId = await seedTemplateJe(org, acct, '2026-01-01')
    const ruleId = await seedRule(org, originalId, 'monthly', TODAY)

    const { data: draft, error: draftErr } = await adminDb()
      .from('journal_entries')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        fiscal_period_id: acct.fiscalPeriodId,
        entry_number: `TPL-${ruleId.slice(0, 8)}-test`,
        entry_date: TODAY,
        memo: 'Monthly dues template (new rate)',
        source: 'manual',
        status: 'draft',
      })
      .select('id')
      .single()
    if (draftErr || !draft) throw new Error(`draft template insert failed: ${draftErr?.message}`)
    await adminDb().from('ledger_entries').insert([
      { organization_id: org.orgId, journal_entry_id: draft.id, account_id: acct.accountIds['1010'], fund_id: acct.fundIds.OPERATING, debit_amount: 125, credit_amount: 0 },
      { organization_id: org.orgId, journal_entry_id: draft.id, account_id: acct.accountIds['4000'], fund_id: acct.fundIds.OPERATING, debit_amount: 0, credit_amount: 125 },
    ])
    await adminDb().from('recurring_journal_entries').update({ template_je_id: draft.id }).eq('id', ruleId)

    const result = await runRecurringJes(adminDb(), inlineStep(), collectingLogger(), NOW)
    expect(result.posted).toBe(1)

    const { data: posted } = await adminDb()
      .from('journal_entries')
      .select('memo, status, lines:ledger_entries(debit_amount)')
      .eq('source', 'recurring')
      .eq('source_id', ruleId)
      .single()
    expect(posted?.status).toBe('posted')
    expect(posted?.memo).toBe('Monthly dues template (new rate)')
    expect(((posted?.lines ?? []) as { debit_amount: number }[]).reduce((s, l) => s + Number(l.debit_amount), 0)).toBe(125)

    const { data: templates } = await adminDb()
      .from('journal_entries')
      .select('id, status')
      .in('id', [originalId, draft.id])
    const statusOf = new Map((templates ?? []).map((t) => [t.id, t.status]))
    expect(statusOf.get(originalId)).toBe('posted')
    expect(statusOf.get(draft.id)).toBe('draft')
  })
})
