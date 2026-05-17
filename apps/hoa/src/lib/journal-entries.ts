'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { postJournalEntry } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

type RecurringInsert =
  Database['public']['Tables']['recurring_journal_entries']['Insert']

export type ReverseJeResult =
  | { ok: true; reversingJeId: string; reversingEntryNumber: string }
  | { ok: false; error: string }
export type PromoteRecurringResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string }

const ReverseSchema = z.object({
  journalEntryId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})

/**
 * Post a reversing entry against an existing posted JE. Spec §13.1 #3:
 * corrections are reversing entries, never deletes. The new JE swaps
 * every line's debit and credit, with source='reversing' and reverses_id
 * pointing back at the original. The original gets its
 * reversed_by_id stamped and status='reversed' so trial balance still
 * zeroes after both sides cancel out.
 *
 * Cannot reverse a JE that's already been reversed (DB allows it but
 * the audit trail gets murky; we gate at the app layer).
 */
export async function reverseJournalEntry(input: {
  journalEntryId: string
  reason?: string
}): Promise<ReverseJeResult> {
  const parsed = ReverseSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: original, error: oErr } = await supabase
    .from('journal_entries')
    .select(
      'id, organization_id, association_id, fiscal_period_id, entry_date, memo, source, status, reversed_by_id, lines:ledger_entries(account_id, fund_id, debit_amount, credit_amount, memo)',
    )
    .eq('id', parsed.data.journalEntryId)
    .eq('association_id', assoc.id)
    .single()

  if (oErr || !original) return { ok: false, error: oErr?.message ?? 'JE not found' }
  if (original.status !== 'posted') {
    return { ok: false, error: `JE is ${original.status}; only posted entries can be reversed` }
  }
  if (original.reversed_by_id) {
    return { ok: false, error: 'This entry has already been reversed.' }
  }

  type LineShape = {
    account_id: string
    fund_id: string
    debit_amount: number
    credit_amount: number
    memo: string | null
  }
  const lines = (original.lines ?? []) as LineShape[]
  if (lines.length === 0) {
    return { ok: false, error: 'Original entry has no lines (cannot reverse).' }
  }

  // Build the reversing JE: every Dr becomes a Cr and vice versa.
  const reversed = lines.map((l) => ({
    accountId: l.account_id,
    fundId: l.fund_id,
    debit: Number(l.credit_amount),
    credit: Number(l.debit_amount),
    memo: l.memo ?? undefined,
  }))

  const je = await postJournalEntry(supabase, {
    organizationId: original.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: original.fiscal_period_id,
    entryDate: new Date().toISOString().slice(0, 10),
    memo:
      parsed.data.reason
        ? `Reversal of ${original.memo}: ${parsed.data.reason}`
        : `Reversal of ${original.memo}`,
    source: 'reversing',
    sourceId: original.id,
    lines: reversed,
  })

  if (!je.ok) return { ok: false, error: `reversal JE failed: ${je.error}` }

  // Cross-link the two and flip original to reversed. Done in parallel
  // — neither write can fail without the other being meaningless, and
  // we already have the new JE committed so the worst case is an audit
  // row pair where the link is one-sided (recoverable by SQL).
  await Promise.all([
    supabase
      .from('journal_entries')
      .update({ reverses_id: original.id })
      .eq('id', je.journalEntryId),
    supabase
      .from('journal_entries')
      .update({ reversed_by_id: je.journalEntryId, status: 'reversed' })
      .eq('id', original.id),
  ])

  revalidatePath(`/accounting/ledger/${original.id}`)
  revalidatePath(`/accounting/ledger/${je.journalEntryId}`)
  revalidatePath('/accounting/ledger')
  return {
    ok: true,
    reversingJeId: je.journalEntryId,
    reversingEntryNumber: je.entryNumber,
  }
}

// ─── promoteToRecurring ──────────────────────────────────────────────

const PromoteSchema = z.object({
  journalEntryId: z.string().uuid(),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  nextRunDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'nextRunDate must be YYYY-MM-DD'),
})

/**
 * Promote a posted JE into a recurring template. The original JE stays
 * untouched as the source-of-truth for the line shape — the daily cron
 * (`packages/jobs/src/recurring-jes.ts`) reads `template_je_id`, clones
 * its lines, and posts a fresh JE on each run.
 *
 * Only posted entries are eligible (a draft has no lines yet; a
 * reversed JE represents a correction, not a pattern). One template
 * per source JE — re-promoting toggles is_active rather than inserting
 * a duplicate (the table has no UNIQUE on template_je_id but doing
 * this client-side keeps history clean).
 */
export async function promoteJeToRecurring(input: {
  journalEntryId: string
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
  nextRunDate: string
}): Promise<PromoteRecurringResult> {
  const parsed = PromoteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: je } = await supabase
    .from('journal_entries')
    .select('id, organization_id, association_id, status')
    .eq('id', value.journalEntryId)
    .eq('association_id', assoc.id)
    .single()
  if (!je) return { ok: false, error: 'journal entry not found' }
  if (je.status !== 'posted') {
    return { ok: false, error: `JE is ${je.status}; only posted entries can be templates` }
  }

  // Re-promote: if a rule already references this template, just flip
  // its cadence + next_run_date + reactivate rather than inserting a new row.
  const { data: existing } = await supabase
    .from('recurring_journal_entries')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('template_je_id', je.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('recurring_journal_entries')
      .update({
        cadence: value.cadence,
        next_run_date: value.nextRunDate,
        is_active: true,
      })
      .eq('id', existing.id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/accounting/recurring')
    revalidatePath(`/accounting/ledger/${je.id}`)
    return { ok: true, ruleId: existing.id }
  }

  const payload: RecurringInsert = {
    organization_id: je.organization_id,
    association_id: je.association_id,
    template_je_id: je.id,
    cadence: value.cadence,
    next_run_date: value.nextRunDate,
    is_active: true,
  }
  const { data: rule, error } = await supabase
    .from('recurring_journal_entries')
    .insert(payload)
    .select('id')
    .single()
  if (error || !rule) return { ok: false, error: `rule insert: ${error?.message}` }

  revalidatePath('/accounting/recurring')
  revalidatePath(`/accounting/ledger/${je.id}`)
  return { ok: true, ruleId: rule.id }
}
