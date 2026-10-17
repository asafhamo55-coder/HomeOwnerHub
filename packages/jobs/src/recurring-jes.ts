import { createAdminClient, postJournalEntry } from '@homeowner-portal/db'
import { inngest } from './client'
import { DEFAULT_ASSOCIATION_TIME_ZONE, todayIn } from './association-time'

/**
 * Daily at 1am ET: scan recurring_journal_entries where next_run_date
 * is on/before today, clone the template JE for today, post it, and
 * advance next_run_date past today.
 *
 * The template JE is referenced by template_je_id — we read its lines
 * and shape, then re-post a fresh JE with source='recurring' and a
 * new entry_date. The original template stays untouched as a model.
 *
 * Backlog collapse: next_run_date can be arbitrarily stale (a rule
 * dormant for months). Advancing by a single cadence step from the old
 * value would post one JE per missed period, each dated the night the
 * job happened to run — wrong on both counts. advancePastToday instead
 * steps the cadence forward, in whole periods, until the result is
 * strictly after today: one JE for the backlog, and next_run_date lands
 * on the next genuine future occurrence rather than drifting to today.
 *
 * Idempotency: advancing next_run_date is NOT sufficient on its own —
 * if postJournalEntry succeeds but the next_run_date update then fails
 * (network blip, RLS, whatever), the rule is still due and a later pass
 * would post a second JE for the same day. So before posting we check
 * journal_entries directly for an existing row with
 * (source='recurring', source_id=rule.id, entry_date=today) and skip
 * the post if one exists, retrying only the advance. That is the actual
 * idempotency guarantee this job makes; a same-day re-run is a no-op
 * for posting either way.
 *
 * Per-association iteration so one bad template can't poison the
 * others' runs; each Inngest step gets its own retries.
 */

export interface RecurringJesStep {
  // Narrowed to the one payload shape this job ever passes through
  // `step.run` — a plain object literal — rather than generic over `T`.
  // Inngest's real `run` return type passes through `Jsonify<Awaited<T>>`,
  // which is not assignable back to an arbitrary `T` and fails structural
  // typing when this interface is generic (see mailbox-send.ts:27-32 and
  // the same finding applied at ticket-notifications.ts:112-117).
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

export interface RecurringJesLogger {
  warn(message: string): void
  error(message: string): void
}

export interface RecurringJesResult {
  rules: number
  posted: number
  skipped: number
  failed: number
}

interface RecurringRuleRow {
  id: string
  organization_id: string
  association_id: string
  template_je_id: string
  cadence: string
  next_run_date: string
  is_active: boolean
}

type RuleStepResult = { posted: number; skipped: number; failed: number }

/**
 * Runs the recurring-JE scan. Exported so it can be driven against a real
 * database in tests. The Inngest wrapper below is a thin shell: it
 * supplies the admin client and today's date, and holds no logic worth
 * testing on its own.
 */
export async function runRecurringJes(
  db: ReturnType<typeof createAdminClient>,
  step: RecurringJesStep,
  logger: RecurringJesLogger,
  // The Eastern day (BL-043), not the UTC day. Per-association days are
  // a follow-up: this scan uses one `today` for every rule.
  today: string = todayIn(DEFAULT_ASSOCIATION_TIME_ZONE),
): Promise<RecurringJesResult> {
  const rules = (await step.run('load-rules', async () => {
    const { data, error } = await db
      .from('recurring_journal_entries')
      .select(
        'id, organization_id, association_id, template_je_id, cadence, next_run_date, is_active',
      )
      .eq('is_active', true)
      .lte('next_run_date', today)

    if (error) {
      logger.error(`[recurring-jes] failed to load rules: ${error.message}`)
      throw new Error(error.message)
    }
    return data ?? []
  })) as RecurringRuleRow[]

  let posted = 0
  let skipped = 0
  let failed = 0

  for (const rule of rules) {
    const result = (await step.run(`rule-${rule.id}`, async () => {
      // Idempotency guard: has this rule already posted today? Covers
      // the case where a prior pass posted the JE but then failed to
      // persist the next_run_date advance, leaving the rule still due.
      const { data: already } = await db
        .from('journal_entries')
        .select('id')
        .eq('source', 'recurring')
        .eq('source_id', rule.id)
        .eq('entry_date', today)
        .maybeSingle()

      if (already) {
        const next = advancePastToday(rule.next_run_date, rule.cadence, today)
        const { error: advanceErr } = await db
          .from('recurring_journal_entries')
          .update({ next_run_date: next })
          .eq('id', rule.id)
        if (advanceErr) {
          logger.warn(
            `[recurring-jes] rule ${rule.id}: already posted for ${today}, but next_run_date advance failed: ${advanceErr.message}`,
          )
          return { posted: 0, skipped: 0, failed: 1 } satisfies RuleStepResult
        }
        return { posted: 0, skipped: 1, failed: 0 } satisfies RuleStepResult
      }

      // Load the template JE + lines.
      const { data: template } = await db
        .from('journal_entries')
        .select(
          'id, memo, source, fiscal_period_id, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount, memo)',
        )
        .eq('id', rule.template_je_id)
        .single()
      if (!template) {
        logger.warn(`[recurring-jes] rule ${rule.id}: template ${rule.template_je_id} missing`)
        return { posted: 0, skipped: 0, failed: 1 } satisfies RuleStepResult
      }

      // The fiscal period at run time may not be the template's
      // original period. Find the current open period for this
      // association; if none, skip.
      const { data: period } = await db
        .from('fiscal_periods')
        .select('id')
        .eq('association_id', rule.association_id)
        .eq('status', 'open')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!period) {
        logger.warn(`[recurring-jes] rule ${rule.id}: no open period`)
        return { posted: 0, skipped: 1, failed: 0 } satisfies RuleStepResult
      }

      type LineShape = {
        account_id: string
        fund_id: string
        debit_amount: number
        credit_amount: number
        memo: string | null
      }
      const lines = (template.lines ?? []) as LineShape[]
      if (lines.length === 0) {
        return { posted: 0, skipped: 1, failed: 0 } satisfies RuleStepResult
      }

      const je = await postJournalEntry(db, {
        organizationId: rule.organization_id,
        associationId: rule.association_id,
        fiscalPeriodId: period.id,
        entryDate: today,
        memo: template.memo,
        source: 'recurring',
        sourceId: rule.id,
        lines: lines.map((l) => ({
          accountId: l.account_id,
          fundId: l.fund_id,
          debit: Number(l.debit_amount),
          credit: Number(l.credit_amount),
          memo: l.memo ?? undefined,
        })),
      })
      if (!je.ok) {
        logger.warn(`[recurring-jes] rule ${rule.id} JE failed: ${je.error}`)
        return { posted: 0, skipped: 0, failed: 1 } satisfies RuleStepResult
      }

      // Collapse the backlog: advance past today in whole cadence
      // steps, not one step from the old value.
      const next = advancePastToday(rule.next_run_date, rule.cadence, today)
      const { error: advanceErr } = await db
        .from('recurring_journal_entries')
        .update({ next_run_date: next })
        .eq('id', rule.id)

      if (advanceErr) {
        // The JE is posted, but the schedule didn't move — don't count
        // this as a clean success, or the failure goes unnoticed while
        // the idempotency guard above silently absorbs every retry.
        logger.warn(
          `[recurring-jes] rule ${rule.id}: JE ${je.journalEntryId} posted but next_run_date advance failed: ${advanceErr.message}`,
        )
        return { posted: 0, skipped: 0, failed: 1 } satisfies RuleStepResult
      }

      return { posted: 1, skipped: 0, failed: 0 } satisfies RuleStepResult
    })) as RuleStepResult

    posted += result.posted
    skipped += result.skipped
    failed += result.failed
  }

  return { rules: rules.length, posted, skipped, failed }
}

export const recurringJeJob = inngest.createFunction(
  { id: 'recurring-jes', name: 'Recurring Journal Entries' },
  { cron: 'TZ=America/New_York 0 1 * * *' },
  async ({ step, logger }) => {
    return runRecurringJes(createAdminClient(), step, logger)
  },
)

/** Hard stop on a cadence that never advances past today — e.g. a future
 *  bad value slipping past the DB's CHECK constraint, or a clock
 *  anomaly. Every branch of advanceDate strictly increases the date, so
 *  this should never actually trip; it exists so a malformed cadence
 *  spins a bounded number of times and surfaces as a wrong-but-finite
 *  date rather than hanging the step forever. */
const MAX_CADENCE_STEPS = 10_000

function advancePastToday(isoDate: string, cadence: string, today: string): string {
  let current = isoDate
  let steps = 0
  while (current <= today) {
    current = advanceDate(current, cadence)
    steps += 1
    if (steps > MAX_CADENCE_STEPS) break
  }
  return current
}

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
      // Unknown cadence: keep the rule from spamming JEs by pushing it
      // forward a full year. The Inngest log will surface the bad cadence.
      dt.setUTCFullYear(dt.getUTCFullYear() + 1)
  }
  return dt.toISOString().slice(0, 10)
}
