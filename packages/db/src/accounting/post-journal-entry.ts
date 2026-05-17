import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '../database.types'

// Spec §13.1: every JE balances overall AND per fund. The DB trigger
// `validate_je_balances` is the source of truth for that invariant — this
// composer pre-checks the same rules so callers get a structured error
// instead of a raw Postgres exception, and rejects bad inputs before
// touching the network.

type Db = Database['public']
type JournalEntryInsert = Db['Tables']['journal_entries']['Insert']
type LedgerEntryInsert = Db['Tables']['ledger_entries']['Insert']

export const JournalEntryLineSchema = z
  .object({
    accountId: z.string().uuid(),
    fundId: z.string().uuid(),
    debit: z.number().nonnegative().default(0),
    credit: z.number().nonnegative().default(0),
    memo: z.string().max(500).optional(),
  })
  .refine(
    (l) =>
      (l.debit > 0 && l.credit === 0) || (l.credit > 0 && l.debit === 0),
    'each line must be exactly one of debit > 0 or credit > 0',
  )

export type JournalEntryLine = z.infer<typeof JournalEntryLineSchema>

export const PostJournalEntryInputSchema = z.object({
  organizationId: z.string().uuid(),
  associationId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'entryDate must be YYYY-MM-DD'),
  memo: z.string().min(1).max(2000),
  source: z.enum([
    'manual',
    'ap_invoice',
    'ar_payment',
    'bank_rec',
    'recurring',
    'closing',
    'reversing',
  ]),
  sourceId: z.string().uuid().optional(),
  aiGenerated: z.boolean().optional(),
  aiWorkflowId: z.string().optional(),
  createdBy: z.string().uuid().optional(),
  lines: z.array(JournalEntryLineSchema).min(2),
})

export type PostJournalEntryInput = z.infer<typeof PostJournalEntryInputSchema>

export type PostJournalEntryResult =
  | { ok: true; journalEntryId: string; entryNumber: string }
  | { ok: false; error: string }

const ENTRY_NUMBER_RETRIES = 3

/**
 * Inserts a balanced JE + lines and flips status to `posted` so the
 * validate_je_balances trigger runs. Pre-checks balance overall AND per
 * fund before any DB call. Accepts any SupabaseClient — pass a
 * user-scoped server client for UI actions, or an admin client for
 * Inngest jobs / webhooks where there's no user session.
 *
 * Returns a typed error envelope; never throws on expected failures
 * (validation, trigger rejection, RLS denial). Genuinely unexpected
 * errors (network, missing tables) propagate.
 */
export async function postJournalEntry(
  supabase: SupabaseClient<Database>,
  input: PostJournalEntryInput,
): Promise<PostJournalEntryResult> {
  const parsed = PostJournalEntryInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_input' }
  }
  const value = parsed.data

  // Pre-check: overall balance (cents-precise, no float drift).
  const debits = sumCents(value.lines.map((l) => l.debit))
  const credits = sumCents(value.lines.map((l) => l.credit))
  if (debits !== credits) {
    return {
      ok: false,
      error: `unbalanced: debits=${cents(debits)} credits=${cents(credits)}`,
    }
  }
  if (debits === 0) {
    return { ok: false, error: 'all-zero JE' }
  }

  // Pre-check: per-fund balance (spec §13.1 — inter-fund transfers must be explicit).
  const perFund = new Map<string, number>()
  for (const l of value.lines) {
    const delta = toCents(l.debit) - toCents(l.credit)
    perFund.set(l.fundId, (perFund.get(l.fundId) ?? 0) + delta)
  }
  const unbalancedFund = [...perFund.entries()].find(([, net]) => net !== 0)
  if (unbalancedFund) {
    return {
      ok: false,
      error: `fund ${unbalancedFund[0]} unbalanced — inter-fund transfers must be explicit`,
    }
  }

  // entry_number is UNIQUE per (association, entry_number). The DB has no
  // sequence per association, so we compute the next number ourselves and
  // retry on a unique-violation race. Three retries is enough for any
  // realistic concurrent-post scenario (typing speed >> millisecond races).
  const year = value.entryDate.slice(0, 4)

  let lastError = 'unknown'
  for (let attempt = 0; attempt < ENTRY_NUMBER_RETRIES; attempt++) {
    const entryNumber = await nextEntryNumber(supabase, value.associationId, year)

    const header: JournalEntryInsert = {
      organization_id: value.organizationId,
      association_id: value.associationId,
      fiscal_period_id: value.fiscalPeriodId,
      entry_number: entryNumber,
      entry_date: value.entryDate,
      memo: value.memo,
      source: value.source,
      source_id: value.sourceId ?? null,
      ai_generated: value.aiGenerated ?? false,
      ai_workflow_id: value.aiWorkflowId ?? null,
      created_by: value.createdBy ?? null,
      status: 'draft',
    }

    const { data: inserted, error: headerErr } = await supabase
      .from('journal_entries')
      .insert(header)
      .select('id')
      .single()

    if (headerErr) {
      // 23505 = unique_violation — entry_number race; retry with a fresh number.
      if (headerErr.code === '23505') {
        lastError = headerErr.message
        continue
      }
      return { ok: false, error: headerErr.message }
    }

    const journalEntryId = inserted.id

    const lineInserts: LedgerEntryInsert[] = value.lines.map((l) => ({
      organization_id: value.organizationId,
      journal_entry_id: journalEntryId,
      account_id: l.accountId,
      fund_id: l.fundId,
      debit_amount: l.debit,
      credit_amount: l.credit,
      memo: l.memo ?? null,
    }))

    const { error: linesErr } = await supabase
      .from('ledger_entries')
      .insert(lineInserts)

    if (linesErr) {
      // Roll back the orphan header so we don't leak draft JEs.
      await supabase.from('journal_entries').delete().eq('id', journalEntryId)
      return { ok: false, error: linesErr.message }
    }

    // Flip to posted — this is what fires validate_je_balances. If the
    // trigger rejects (which our pre-checks make near-impossible, but the
    // DB is the contract), surface the message and roll back.
    const { error: postErr } = await supabase
      .from('journal_entries')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        posted_by: value.createdBy ?? null,
      })
      .eq('id', journalEntryId)

    if (postErr) {
      await supabase.from('journal_entries').delete().eq('id', journalEntryId)
      return { ok: false, error: postErr.message }
    }

    return { ok: true, journalEntryId, entryNumber }
  }

  return { ok: false, error: `entry_number race after ${ENTRY_NUMBER_RETRIES} retries: ${lastError}` }
}

async function nextEntryNumber(
  supabase: SupabaseClient<Database>,
  associationId: string,
  year: string,
): Promise<string> {
  const prefix = `JE-${year}-`
  const { data } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .eq('association_id', associationId)
    .like('entry_number', `${prefix}%`)
    .order('entry_number', { ascending: false })
    .limit(1)

  const last = data?.[0]?.entry_number
  const lastSeq = last ? Number.parseInt(last.slice(prefix.length), 10) : 0
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1
  return `${prefix}${String(next).padStart(5, '0')}`
}

function toCents(amount: number): number {
  return Math.round(amount * 100)
}

function sumCents(amounts: number[]): number {
  return amounts.reduce((s, n) => s + toCents(n), 0)
}

function cents(value: number): string {
  return (value / 100).toFixed(2)
}
