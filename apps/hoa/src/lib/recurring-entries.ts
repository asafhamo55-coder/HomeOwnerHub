'use server'

// BL-081: pause, resume, stop and edit a recurring journal entry from
// /accounting/recurring. Board/admin only (the gate here; RLS 0061 is the
// real boundary). Rules and wording: lib/accounting/recurring-edit.ts.
// Entries already posted — the original template and every copy — are
// never changed. Audit rows and logs carry ids, dates and amounts only.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getPrimaryAssociation } from '@/lib/vendors'
import { todayIn } from '@/lib/association-time'
import {
  allowedActions,
  entryTotal,
  LIFECYCLE_ACTIONS,
  RECURRING_AUDIT,
  RECURRING_AUDIT_ENTITY,
  recurringState,
  sortLines,
  templateChanged,
  templateEntryNumber,
  validateRecurringEdit,
  type EditLine,
  type LifecycleAction,
} from '@/lib/accounting/recurring-edit'

type JournalEntryInsert = Database['public']['Tables']['journal_entries']['Insert']
type LedgerEntryInsert = Database['public']['Tables']['ledger_entries']['Insert']
type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

export type RecurringActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')

const StateSchema = z.object({
  ruleId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'stop']),
  /** Resume only: when it runs next. */
  nextRunDate: DAY.optional(),
})

const EditSchema = z.object({
  ruleId: z.string().uuid(),
  memo: z.string().max(4000),
  cadence: z.string().max(20),
  nextRunDate: z.string().max(10),
  lines: z
    .array(
      z.object({
        accountId: z.string().max(64),
        fundId: z.string().max(64),
        debit: z.number().finite(),
        credit: z.number().finite(),
      }),
    )
    .max(50),
})

const NOT_FOUND = 'That recurring entry isn’t in this association.'
const STOPPED = 'This recurring entry was stopped. To start it again, open the entry in the ledger and select Make recurring.'

interface RuleRow {
  id: string
  organization_id: string
  association_id: string
  cadence: string
  next_run_date: string
  is_active: boolean
  template_je_id: string
}

async function loadRule(supabase: ServerClient, ruleId: string, associationId: string): Promise<RuleRow | null> {
  const { data } = await supabase
    .from('recurring_journal_entries')
    .select('id, organization_id, association_id, cadence, next_run_date, is_active, template_je_id')
    .eq('id', ruleId)
    .eq('association_id', associationId)
    .maybeSingle()
  return (data as RuleRow | null) ?? null
}

/** The rule's newest lifecycle audit action, or null. Throws on a failed
 *  read: a stopped rule must not read as merely paused. */
async function latestLifecycle(supabase: ServerClient, orgId: string, ruleId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('action, created_at')
    .eq('org_id', orgId)
    .eq('entity_type', RECURRING_AUDIT_ENTITY)
    .eq('entity_id', ruleId)
    .in('action', [...LIFECYCLE_ACTIONS])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`recurring lifecycle read failed (${error.code ?? 'unknown'})`)
  return (data?.[0]?.action as string | undefined) ?? null
}

async function audit(
  supabase: ServerClient,
  row: { orgId: string; userId: string; action: string; ruleId: string; metadata: Record<string, unknown> },
): Promise<boolean> {
  const { error } = await supabase.from('audit_log').insert({
    org_id: row.orgId,
    user_id: row.userId,
    action: row.action,
    entity_type: RECURRING_AUDIT_ENTITY,
    entity_id: row.ruleId,
    metadata: row.metadata as never,
  })
  if (error) console.error('[recurring-entries] audit insert failed', { ruleId: row.ruleId, action: row.action, code: error.code ?? null })
  return !error
}

function revalidate(templateIds: string[]) {
  revalidatePath('/accounting/recurring')
  for (const id of templateIds) revalidatePath(`/accounting/ledger/${id}`)
}

const AUDIT_FOR: Record<LifecycleAction, string> = {
  pause: RECURRING_AUDIT.paused,
  resume: RECURRING_AUDIT.resumed,
  stop: RECURRING_AUDIT.stopped,
}

export async function changeRecurringEntryState(input: {
  ruleId: string
  action: LifecycleAction
  nextRunDate?: string
}): Promise<RecurringActionResult> {
  const parsed = StateSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return issue?.path[0] === 'nextRunDate'
      ? { ok: false, error: 'Pick a date.', fieldErrors: { nextRunDate: 'Pick a date.' } }
      : { ok: false, error: 'Couldn’t read that change. Reload the page and try again.' }
  }
  const value = parsed.data

  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { ok: false, error: 'You are not signed in.' }

  const rule = await loadRule(supabase, value.ruleId, assoc.id)
  if (!rule) return { ok: false, error: NOT_FOUND }

  let state
  try {
    state = recurringState(rule.is_active, await latestLifecycle(supabase, rule.organization_id, rule.id))
  } catch {
    return { ok: false, error: 'Couldn’t check this entry’s history. Nothing changed. Try again.' }
  }
  if (!allowedActions(state).includes(value.action)) {
    if (state === 'stopped') return { ok: false, error: STOPPED }
    return { ok: false, error: state === 'active' ? 'This entry is already running.' : 'This entry is already paused.' }
  }

  const today = todayIn(assoc.timeZone)
  let nextRunDate = rule.next_run_date
  if (value.action === 'resume') {
    nextRunDate = value.nextRunDate ?? rule.next_run_date
    if (nextRunDate < today) {
      return { ok: false, error: 'Pick today or a later date.', fieldErrors: { nextRunDate: 'Pick today or a later date.' } }
    }
  }

  const metadata = { next_run_date: nextRunDate, previous_next_run_date: rule.next_run_date, association_id: assoc.id }

  // Stop: the audit row IS the "stopped" state (there's no column), so it
  // is written first. If the pause below then fails, the rule is still
  // active and reads as active — never stopped-but-running.
  if (value.action === 'stop') {
    const recorded = await audit(supabase, { orgId: rule.organization_id, userId, action: AUDIT_FOR.stop, ruleId: rule.id, metadata })
    if (!recorded) return { ok: false, error: 'Couldn’t stop the entry. Nothing changed. Try again.' }
  }

  const patch = value.action === 'resume' ? { is_active: true, next_run_date: nextRunDate } : { is_active: false }
  const { data: changed, error } = await supabase
    .from('recurring_journal_entries')
    .update(patch)
    .eq('id', rule.id)
    .eq('association_id', assoc.id)
    .select('id')
  if (error || !changed || changed.length === 0) {
    console.error('[recurring-entries] state update failed', { ruleId: rule.id, action: value.action, code: error?.code ?? null })
    return { ok: false, error: 'Couldn’t save the change. Try again.' }
  }

  if (value.action !== 'stop') {
    await audit(supabase, { orgId: rule.organization_id, userId, action: AUDIT_FOR[value.action], ruleId: rule.id, metadata })
  }

  revalidate([rule.template_je_id])
  return { ok: true }
}

type TemplateLine = { account_id: string; fund_id: string; debit_amount: number | string; credit_amount: number | string; memo: string | null }
type TemplateRow = { id: string; memo: string; fiscal_period_id: string; lines: TemplateLine[] | null }

export async function updateRecurringEntry(input: {
  ruleId: string
  memo: string
  cadence: string
  nextRunDate: string
  lines: EditLine[]
}): Promise<RecurringActionResult> {
  const parsed = EditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Couldn’t read that change. Reload the page and try again.' }
  const value = parsed.data

  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { ok: false, error: 'You are not signed in.' }

  const rule = await loadRule(supabase, value.ruleId, assoc.id)
  if (!rule) return { ok: false, error: NOT_FOUND }

  try {
    if (recurringState(rule.is_active, await latestLifecycle(supabase, rule.organization_id, rule.id)) === 'stopped') {
      return { ok: false, error: STOPPED }
    }
  } catch {
    return { ok: false, error: 'Couldn’t check this entry’s history. Nothing changed. Try again.' }
  }

  const [templateRes, accountsRes, fundsRes] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('id, memo, fiscal_period_id, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount, memo)')
      .eq('id', rule.template_je_id)
      .eq('association_id', assoc.id)
      .maybeSingle(),
    supabase.from('chart_of_accounts').select('id, fund_id, is_active').eq('association_id', assoc.id),
    supabase.from('funds').select('id').eq('association_id', assoc.id),
  ])
  if (templateRes.error || accountsRes.error || fundsRes.error) {
    return { ok: false, error: 'Couldn’t load the entry’s accounts. Nothing changed. Try again.' }
  }
  const template = templateRes.data as TemplateRow | null
  if (!template) return { ok: false, error: 'This entry’s template is missing, so it can’t be edited.' }

  const today = todayIn(assoc.timeZone)
  const fieldErrors = validateRecurringEdit(value, {
    accounts: (accountsRes.data ?? []).map((a) => ({ id: a.id, fundId: a.fund_id, isActive: a.is_active })),
    fundIds: (fundsRes.data ?? []).map((f) => f.id),
    today,
  })
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
  }

  const memo = value.memo.trim()
  const beforeLines: (EditLine & { memo: string | null })[] = sortLines(
    (template.lines ?? []).map((l) => ({
      accountId: l.account_id,
      fundId: l.fund_id,
      debit: Number(l.debit_amount),
      credit: Number(l.credit_amount),
      memo: l.memo,
    })),
  )
  const linesChanged = templateChanged({ memo: template.memo, lines: beforeLines }, { memo, lines: value.lines })

  // A new DRAFT template when the memo or lines change: the old template
  // is a posted entry and stays exactly as it is.
  let templateId = template.id
  if (linesChanged) {
    const header: JournalEntryInsert = {
      organization_id: rule.organization_id,
      association_id: assoc.id,
      fiscal_period_id: template.fiscal_period_id,
      entry_number: templateEntryNumber(rule.id, new Date()),
      entry_date: value.nextRunDate,
      memo,
      source: 'manual',
      source_id: null,
      status: 'draft',
      created_by: userId,
    }
    const { data: draft, error: draftErr } = await supabase.from('journal_entries').insert(header).select('id').single()
    if (draftErr || !draft) {
      console.error('[recurring-entries] template insert failed', { ruleId: rule.id, code: draftErr?.code ?? null })
      return { ok: false, error: 'Couldn’t save the new amounts. Nothing changed. Try again.' }
    }
    const lines: LedgerEntryInsert[] = value.lines.map((l, i) => ({
      organization_id: rule.organization_id,
      journal_entry_id: draft.id,
      account_id: l.accountId,
      fund_id: l.fundId,
      debit_amount: Math.round(l.debit * 100) / 100,
      credit_amount: Math.round(l.credit * 100) / 100,
      memo: beforeLines[i]?.memo ?? null,
    }))
    const { error: linesErr } = await supabase.from('ledger_entries').insert(lines)
    if (linesErr) {
      await supabase.from('journal_entries').delete().eq('id', draft.id).eq('status', 'draft')
      console.error('[recurring-entries] template lines insert failed', { ruleId: rule.id, code: linesErr.code ?? null })
      return { ok: false, error: 'Couldn’t save the new amounts. Nothing changed. Try again.' }
    }
    templateId = draft.id
  }

  const { data: changed, error } = await supabase
    .from('recurring_journal_entries')
    .update({ cadence: value.cadence, next_run_date: value.nextRunDate, template_je_id: templateId })
    .eq('id', rule.id)
    .eq('association_id', assoc.id)
    .select('id')
  if (error || !changed || changed.length === 0) {
    if (templateId !== template.id) await supabase.from('journal_entries').delete().eq('id', templateId).eq('status', 'draft')
    console.error('[recurring-entries] rule update failed', { ruleId: rule.id, code: error?.code ?? null })
    return { ok: false, error: 'Couldn’t save the change. Nothing changed. Try again.' }
  }

  const changedFields = [
    ...(memo !== template.memo.trim() ? ['memo'] : []),
    ...(linesChanged && templateChanged({ memo: '', lines: beforeLines }, { memo: '', lines: value.lines }) ? ['lines'] : []),
    ...(value.cadence !== rule.cadence ? ['cadence'] : []),
    ...(value.nextRunDate !== rule.next_run_date ? ['next_run_date'] : []),
  ]
  await audit(supabase, {
    orgId: rule.organization_id,
    userId,
    action: RECURRING_AUDIT.updated,
    ruleId: rule.id,
    metadata: {
      changed: changedFields,
      previous_template_je_id: template.id,
      template_je_id: templateId,
      previous_total: entryTotal(beforeLines),
      total: entryTotal(value.lines),
      previous_cadence: rule.cadence,
      cadence: value.cadence,
      previous_next_run_date: rule.next_run_date,
      next_run_date: value.nextRunDate,
    },
  })

  revalidate([template.id, templateId])
  return { ok: true }
}
