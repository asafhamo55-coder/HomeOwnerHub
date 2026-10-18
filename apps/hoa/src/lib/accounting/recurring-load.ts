// BL-081: the recurring entries list, with each rule's state. An inactive
// rule is Paused or Stopped by its newest lifecycle audit row
// (recurring-edit.ts); that read failing throws, so the page says
// "Couldn't load" instead of showing a stopped entry as resumable.

import { chunk } from '@/lib/supabase/read-all'
import {
  isTemplateEntryNumber,
  LIFECYCLE_ACTIONS,
  RECURRING_AUDIT_ENTITY,
  recurringState,
  sortLines,
} from './recurring-edit'
import type { RecurringRuleView } from '@/app/(dashboard)/accounting/recurring/model'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

type RuleRow = {
  id: string
  cadence: string
  next_run_date: string
  is_active: boolean
  template: {
    id: string
    entry_number: string
    memo: string
    lines: { account_id: string; fund_id: string; debit_amount: number | string; credit_amount: number | string }[] | null
  } | null
}

function failed(what: string, e: { code?: string } | null): Error {
  return new Error(`recurring entries: ${what} read failed (${e?.code ?? 'unknown'})`)
}

export async function loadRecurringRules(
  db: Db,
  ctx: { organizationId: string; associationId: string },
): Promise<RecurringRuleView[]> {
  const { data, error } = await db
    .from('recurring_journal_entries')
    .select(
      'id, cadence, next_run_date, is_active, template:template_je_id(id, entry_number, memo, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount))',
    )
    .eq('association_id', ctx.associationId)
    .order('next_run_date', { ascending: true })
  if (error) throw failed('rules', error)
  const rules = (data ?? []) as RuleRow[]

  const inactive = rules.filter((r) => !r.is_active).map((r) => r.id)
  const latest = new Map<string, { action: string; at: string }>()
  for (const ids of chunk(inactive)) {
    const { data: rows, error: auditErr } = await db
      .from('audit_log')
      .select('entity_id, action, created_at')
      .eq('org_id', ctx.organizationId)
      .eq('entity_type', RECURRING_AUDIT_ENTITY)
      .in('action', [...LIFECYCLE_ACTIONS])
      .in('entity_id', ids)
    if (auditErr) throw failed('history', auditErr)
    for (const r of (rows ?? []) as { entity_id: string; action: string; created_at: string }[]) {
      const prev = latest.get(r.entity_id)
      if (!prev || r.created_at > prev.at) latest.set(r.entity_id, { action: r.action, at: r.created_at })
    }
  }

  return rules.map((r) => ({
    id: r.id,
    cadence: r.cadence,
    nextRunDate: r.next_run_date,
    state: recurringState(r.is_active, latest.get(r.id)?.action),
    template: r.template
      ? {
          id: r.template.id,
          entryNumber: r.template.entry_number,
          memo: r.template.memo,
          edited: isTemplateEntryNumber(r.template.entry_number),
          lines: sortLines(
            (r.template.lines ?? []).map((l) => ({
              accountId: l.account_id,
              fundId: l.fund_id,
              debit: Number(l.debit_amount),
              credit: Number(l.credit_amount),
            })),
          ),
        }
      : null,
  }))
}
