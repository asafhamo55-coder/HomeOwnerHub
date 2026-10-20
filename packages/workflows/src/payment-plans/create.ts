/**
 * Create a payment plan that REPLACES the charges it spreads (2026-10-19).
 * See ledger.ts for the journal entries and why.
 *
 * `createPlanWithLedger` is the whole operation behind a small store
 * interface, so the unit tests run it in memory and the integration test
 * runs it against Postgres. `supabasePlanStore` is the real store; the
 * server action (apps/hoa/src/lib/payment-plans.ts) does the auth, the
 * open period and the accounting refs, then calls this.
 *
 * ORDER. Plan row → each replaced charge is CLAIMED (`open|partial →
 * waived`, conditional on its status, so a payment recorded meanwhile
 * makes the claim fail instead of being double-closed) and its closing
 * entry posted → each installment inserted and its entry posted. Any
 * failure undoes what was done, newest first: posted entries get a
 * reversing entry (corrections are reversals, never deletes — spec
 * §13.1 #3), claimed charges go back to their status, installments and
 * the plan row are removed.
 *
 * CANCEL / DEFAULT. Nothing here re-opens a replaced charge later. The
 * plan is the agreement that replaced them: if a plan is ever cancelled or
 * defaulted, the installments not yet paid stay owed (they are ordinary
 * charges), and the replaced charges stay closed. There is no cancel or
 * default action in the app today; one built later must keep this rule,
 * or the balance is counted twice again.
 *
 * No PII: errors carry ids and counts only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { postJournalEntry } from '@homeowner-portal/db'
import type { Database } from '@homeowner-portal/db/types'
import { planLedger, REPLACED_STATUS, REPLACEABLE_STATUSES, type PlanCharge, type PlanLedgerRefs, type PlanLine } from './ledger'

export interface PlanEntryInput {
  memo: string
  sourceId: string
  lines: PlanLine[]
}

export interface PlanStore {
  /** Every charge on the unit (deleted ones flagged), with payments summed. */
  loadUnitCharges(unitId: string): Promise<PlanCharge[]>
  insertPlan(row: { unitId: string; totalCents: number; installmentCount: number; installmentCents: number; startDate: string }): Promise<string>
  /** open|partial → waived, only if the status is still `fromStatus`. False when it changed. */
  claimCharge(chargeId: string, fromStatus: string): Promise<boolean>
  releaseCharge(chargeId: string, toStatus: string): Promise<void>
  insertInstallment(row: { unitId: string; dueDate: string; amountCents: number }): Promise<string>
  postEntry(entry: PlanEntryInput): Promise<{ ok: true; id: string } | { ok: false; error: string }>
  /** Post the swapped-line reversal of `id` and mark `id` reversed. */
  reverseEntry(id: string, entry: PlanEntryInput, reason: string): Promise<void>
  deleteInstallments(ids: string[]): Promise<void>
  deletePlan(id: string): Promise<void>
}

export interface CreatePlanInput {
  unitId: string
  chargeIds: string[]
  installmentCount: number
  startDate: string
  /** What the board saw on the form; refused if the open balance moved since. */
  expectedTotalCents?: number
}

export type CreatePlanOutcome =
  | { ok: true; planId: string; totalCents: number; installmentIds: string[]; replacedChargeIds: string[] }
  | { ok: false; error: string; cleanupFailed?: boolean }

export async function createPlanWithLedger(
  store: PlanStore,
  refs: PlanLedgerRefs,
  input: CreatePlanInput,
): Promise<CreatePlanOutcome> {
  const ids = [...new Set(input.chargeIds)]
  if (ids.length === 0) return { ok: false, error: 'Pick at least one open charge for the plan to replace.' }

  const all = await store.loadUnitCharges(input.unitId)
  const byId = new Map(all.map((c) => [c.id, c]))
  const chosen: PlanCharge[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (!c) return { ok: false, error: 'A selected charge is not on this property.' }
    if (c.deleted || !REPLACEABLE_STATUSES.includes(c.status) || c.amountCents - c.paidCents <= 0) {
      return { ok: false, error: 'A selected charge is no longer open. Reload the page and pick again.' }
    }
    chosen.push(c)
  }

  // The plan id is needed for the memos; plan the amounts first with a
  // placeholder to validate them, then for real once the row exists.
  const draft = planLedger({ planId: '00000000', startDate: input.startDate, installmentCount: input.installmentCount, charges: chosen, refs })
  if (input.expectedTotalCents !== undefined && input.expectedTotalCents !== draft.totalCents) {
    return { ok: false, error: 'The open balance on these charges changed since the page loaded. Reload and check the total.' }
  }
  if (draft.installments.some((i) => i.amountCents <= 0)) {
    return { ok: false, error: 'Too many installments for this balance. Use fewer installments.' }
  }

  const planId = await store.insertPlan({
    unitId: input.unitId,
    totalCents: draft.totalCents,
    installmentCount: input.installmentCount,
    installmentCents: draft.installments[0]!.amountCents,
    startDate: input.startDate,
  })
  const plan = planLedger({ planId, startDate: input.startDate, installmentCount: input.installmentCount, charges: chosen, refs })

  const posted: { id: string; entry: PlanEntryInput }[] = []
  const claimed: { id: string; from: string }[] = []
  const installmentIds: string[] = []

  const undo = async (error: string): Promise<CreatePlanOutcome> => {
    let cleanupFailed = false
    const attempt = async (fn: () => Promise<void>) => {
      try {
        await fn()
      } catch {
        cleanupFailed = true
      }
    }
    for (const p of [...posted].reverse()) await attempt(() => store.reverseEntry(p.id, p.entry, 'payment plan was not created'))
    for (const c of [...claimed].reverse()) await attempt(() => store.releaseCharge(c.id, c.from))
    if (installmentIds.length > 0) await attempt(() => store.deleteInstallments(installmentIds))
    await attempt(() => store.deletePlan(planId))
    return cleanupFailed
      ? { ok: false, error: `${error} Undoing it did not finish: check plan ${planId.slice(0, 8)} in the ledger.`, cleanupFailed }
      : { ok: false, error }
  }

  try {
    for (const r of plan.replacements) {
      const charge = byId.get(r.chargeId)!
      if (!(await store.claimCharge(r.chargeId, charge.status))) {
        return await undo('A selected charge was paid or changed while the plan was being made. Nothing was saved.')
      }
      claimed.push({ id: r.chargeId, from: charge.status })
      const entry = { memo: r.memo, sourceId: r.chargeId, lines: r.lines }
      const je = await store.postEntry(entry)
      if (!je.ok) return await undo(`Closing a replaced charge failed: ${je.error}`)
      posted.push({ id: je.id, entry })
    }

    for (const i of plan.installments) {
      const id = await store.insertInstallment({ unitId: input.unitId, dueDate: i.dueDate, amountCents: i.amountCents })
      installmentIds.push(id)
      const entry = { memo: i.memo, sourceId: id, lines: i.lines }
      const je = await store.postEntry(entry)
      if (!je.ok) return await undo(`Installment ${i.index} failed to post: ${je.error}`)
      posted.push({ id: je.id, entry })
    }
  } catch (e) {
    return await undo(`The plan was not created: ${e instanceof Error ? e.message : 'unexpected error'}.`)
  }

  return { ok: true, planId, totalCents: plan.totalCents, installmentIds, replacedChargeIds: plan.replacements.map((r) => r.chargeId) }
}

// ─── the real store ──────────────────────────────────────────────────

export interface PlanStoreContext {
  organizationId: string
  associationId: string
  fiscalPeriodId: string
  /** The association's today: every entry's date. */
  entryDate: string
  /** assessments.memo_code for installments (Pay-by-Zelle), or null. */
  installmentMemoCode: string | null
}

const toCents = (n: number | string) => Math.round(Number(n) * 100)

const fail = (what: string, e: { message?: string } | null) => new Error(`${what}: ${e?.message ?? 'no row'}`)

/** Max charges one read returns; a unit with more is refused, never truncated. */
const UNIT_CHARGES_MAX = 1000

/** Every charge on one unit, payments summed. Throws on a failed or capped read. */
export async function loadUnitPlanCharges(db: SupabaseClient<Database>, associationId: string, unitId: string): Promise<PlanCharge[]> {
  const { data, error } = await db
    .from('assessments')
    .select('id, assessment_type, due_date, amount, status, deleted_at, payments(amount)')
    .eq('association_id', associationId)
    .eq('unit_id', unitId)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .range(0, UNIT_CHARGES_MAX - 1)
  if (error) throw fail('charges read failed', error)
  type Row = { id: string; assessment_type: string; due_date: string; amount: number; status: string; deleted_at: string | null; payments: { amount: number }[] | null }
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length >= UNIT_CHARGES_MAX) throw new Error('charges read capped')
  return rows.map((a) => ({
    id: a.id,
    assessmentType: a.assessment_type,
    dueDate: a.due_date,
    amountCents: toCents(a.amount),
    paidCents: (a.payments ?? []).reduce((t, p) => t + toCents(p.amount), 0),
    status: a.status,
    deleted: a.deleted_at !== null,
  }))
}

export function supabasePlanStore(db: SupabaseClient<Database>, ctx: PlanStoreContext): PlanStore {
  return {
    loadUnitCharges: (unitId) => loadUnitPlanCharges(db, ctx.associationId, unitId),
    async insertPlan(row) {
      const { data, error } = await db
        .from('payment_plans')
        .insert({
          organization_id: ctx.organizationId,
          unit_id: row.unitId,
          total_amount: row.totalCents / 100,
          installment_count: row.installmentCount,
          installment_amount: row.installmentCents / 100,
          start_date: row.startDate,
          status: 'active',
        })
        .select('id')
        .single()
      if (error || !data) throw fail('plan insert failed', error)
      return data.id
    },
    async claimCharge(chargeId, fromStatus) {
      const { data, error } = await db
        .from('assessments')
        .update({ status: REPLACED_STATUS })
        .eq('id', chargeId)
        .eq('association_id', ctx.associationId)
        .eq('status', fromStatus)
        .is('deleted_at', null)
        .select('id')
      if (error) throw fail('charge close failed', error)
      return (data ?? []).length === 1
    },
    async releaseCharge(chargeId, toStatus) {
      const { error } = await db
        .from('assessments')
        .update({ status: toStatus })
        .eq('id', chargeId)
        .eq('association_id', ctx.associationId)
        .eq('status', REPLACED_STATUS)
      if (error) throw fail('charge re-open failed', error)
    },
    async insertInstallment(row) {
      const { data, error } = await db
        .from('assessments')
        .insert({
          organization_id: ctx.organizationId,
          association_id: ctx.associationId,
          unit_id: row.unitId,
          fiscal_period_id: ctx.fiscalPeriodId,
          // 'special' per the CHECK (regular/special/late_fee/fine).
          assessment_type: 'special',
          amount: row.amountCents / 100,
          due_date: row.dueDate,
          memo_code: ctx.installmentMemoCode,
          status: 'open',
        })
        .select('id')
        .single()
      if (error || !data) throw fail('installment insert failed', error)
      return data.id
    },
    async postEntry(entry) {
      const je = await postJournalEntry(db, {
        organizationId: ctx.organizationId,
        associationId: ctx.associationId,
        fiscalPeriodId: ctx.fiscalPeriodId,
        entryDate: ctx.entryDate,
        memo: entry.memo,
        source: 'ar_payment',
        sourceId: entry.sourceId,
        lines: entry.lines,
      })
      return je.ok ? { ok: true, id: je.journalEntryId } : { ok: false, error: je.error }
    },
    async reverseEntry(id, entry, reason) {
      const je = await postJournalEntry(db, {
        organizationId: ctx.organizationId,
        associationId: ctx.associationId,
        fiscalPeriodId: ctx.fiscalPeriodId,
        entryDate: ctx.entryDate,
        memo: `Reversal of ${entry.memo}: ${reason}`,
        source: 'reversing',
        sourceId: id,
        lines: entry.lines.map((l) => ({ accountId: l.accountId, fundId: l.fundId, debit: l.credit, credit: l.debit })),
      })
      if (!je.ok) throw new Error(`reversal failed: ${je.error}`)
      const [a, b] = await Promise.all([
        db.from('journal_entries').update({ reverses_id: id }).eq('id', je.journalEntryId),
        db.from('journal_entries').update({ reversed_by_id: je.journalEntryId, status: 'reversed' }).eq('id', id),
      ])
      if (a.error || b.error) throw fail('reversal link failed', a.error ?? b.error)
    },
    async deleteInstallments(ids) {
      const { error } = await db.from('assessments').delete().in('id', ids)
      if (error) throw fail('installment delete failed', error)
    },
    async deletePlan(id) {
      const { error } = await db.from('payment_plans').delete().eq('id', id)
      if (error) throw fail('plan delete failed', error)
    },
  }
}
