import { createAdminClient, postJournalEntry } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * Daily at 1am ET: scan recurring_journal_entries where next_run_date
 * is on/before today, clone the template JE for today, post it, and
 * advance next_run_date by the cadence.
 *
 * The template JE is referenced by template_je_id — we read its lines
 * and shape, then re-post a fresh JE with source='recurring' and a
 * new entry_date. The original template stays untouched as a model.
 *
 * Idempotency: advancing next_run_date is the marker. If the cron runs
 * twice in a day, the second pass sees next_run_date already in the
 * future and skips.
 *
 * Per-association iteration so one bad template can't poison the
 * others' runs; each Inngest step gets its own retries.
 */
export const recurringJeJob = inngest.createFunction(
  { id: 'recurring-jes', name: 'Recurring Journal Entries' },
  { cron: 'TZ=America/New_York 0 1 * * *' },
  async ({ step, logger }) => {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)

    const { data: rules, error } = await db
      .from('recurring_journal_entries')
      .select(
        'id, organization_id, association_id, template_je_id, cadence, next_run_date, is_active',
      )
      .eq('is_active', true)
      .lte('next_run_date', today)

    if (error) {
      logger.error('[recurring-jes] failed to load rules', error)
      throw new Error(error.message)
    }

    let posted = 0
    let skipped = 0
    let failed = 0

    for (const rule of rules ?? []) {
      const result = await step.run(`rule-${rule.id}`, async () => {
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
          return { posted: 0, skipped: 0, failed: 1 }
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
          return { posted: 0, skipped: 1, failed: 0 }
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
          return { posted: 0, skipped: 1, failed: 0 }
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
          return { posted: 0, skipped: 0, failed: 1 }
        }

        // Advance next_run_date by cadence.
        const next = advanceDate(rule.next_run_date, rule.cadence)
        await db
          .from('recurring_journal_entries')
          .update({ next_run_date: next })
          .eq('id', rule.id)

        return { posted: 1, skipped: 0, failed: 0 }
      })

      posted += result.posted
      skipped += result.skipped
      failed += result.failed
    }

    return {
      rules: (rules ?? []).length,
      posted,
      skipped,
      failed,
    }
  },
)

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
