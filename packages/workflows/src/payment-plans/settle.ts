/**
 * Payment-plan completion (BL-080) — the reads and the one write.
 *
 * `completePaidOffPlans` moves every ACTIVE plan whose installments are
 * all settled (progress.ts) to `completed`, and writes one audit row per
 * plan with the completion day. It runs:
 *   - where a payment is recorded (markAssessmentPaid, the bank-rec
 *     manual confirm, the W18 cash-receipt executor), scoped to the
 *     paying unit; and
 *   - nightly, before the dues-reminder plan, for every association —
 *     so a home that paid off its plan yesterday is reminded normally
 *     today, and a plan paid by any path not listed above still closes.
 *
 * The status write is a claim: `UPDATE … WHERE status = 'active'`. Two
 * concurrent runs can't both complete (or audit) the same plan.
 *
 * The schema has no completed_at column; the audit row carries the day
 * (`metadata.completed_on`) and is what the board screens read back.
 *
 * Reads THROW on error (a failed read must not read as "nothing paid").
 * Logs and audit metadata carry ids and counts only.
 */

import {
  INSTALLMENT_MEMO_PREFIX,
  installmentFromMemo,
  installmentMemoPattern,
  installmentsByPlan,
  planProgress,
  type InstallmentRecord,
  type PlanProgress,
  type PlanRecord,
} from './progress'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlanDb = { from: (table: string) => any }

export const PLAN_COMPLETED_ACTION = 'payment_plan.completed'
export const PLAN_AUDIT_ENTITY = 'payment_plan'

const PAGE = 1000
const IN_CHUNK = 100
/** Up to this many plans, read each plan's installment entries by its own
 *  memo; beyond it, one association-wide scan is fewer requests. */
const PER_PLAN_READ_MAX = 20

type QueryError = { code?: string; message?: string }

function readFailed(what: string, e: QueryError): Error {
  // Code only: a PostgrestError message/details can echo row values.
  return new Error(`payment-plans: ${what} read failed (${e.code ?? 'unknown'})`)
}

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: QueryError | null }>, what: string): Promise<T[]> {
  const out: T[] = []
  for (;;) {
    const from = out.length
    if (from > 200_000) throw new Error(`payment-plans: ${what} has too many rows`)
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw readFailed(what, error)
    const rows = data ?? []
    if (rows.length === 0) return out
    out.push(...rows)
  }
}

function chunks<T>(xs: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

type JeRow = { source_id: string | null; memo: string }
type AssessmentRow = {
  id: string
  unit_id: string
  amount: number | string
  due_date: string
  status: string
  deleted_at: string | null
  payments: { amount: number | string }[] | null
}

/**
 * Installment records for `associationId`. With `plans`, only those plans'
 * installments (by memo); without, every installment in the association.
 */
export async function loadInstallments(
  db: PlanDb,
  associationId: string,
  plans?: readonly Pick<PlanRecord, 'id'>[],
): Promise<InstallmentRecord[]> {
  const base = () =>
    db
      .from('journal_entries')
      .select('source_id, memo')
      .eq('association_id', associationId)
      .eq('source', 'ar_payment')

  let entries: JeRow[] = []
  if (plans && plans.length === 0) return []
  if (plans && plans.length <= PER_PLAN_READ_MAX) {
    for (const p of plans) {
      entries.push(
        ...(await readAll<JeRow>(
          (from, to) => base().like('memo', installmentMemoPattern(p.id)).order('id', { ascending: true }).range(from, to),
          'installment entries',
        )),
      )
    }
  } else {
    entries = await readAll<JeRow>(
      (from, to) => base().like('memo', `${INSTALLMENT_MEMO_PREFIX}%`).order('id', { ascending: true }).range(from, to),
      'installment entries',
    )
  }

  const linkById = new Map<string, { key: string; index: number }>()
  for (const e of entries) {
    const parsed = installmentFromMemo(e.memo)
    if (!parsed || !e.source_id) continue
    linkById.set(e.source_id, { key: parsed.key, index: parsed.index })
  }
  if (linkById.size === 0) return []

  const out: InstallmentRecord[] = []
  for (const ids of chunks([...linkById.keys()])) {
    const rows = await readAll<AssessmentRow>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, unit_id, amount, due_date, status, deleted_at, payments(amount)')
          .eq('association_id', associationId)
          .in('id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      'installments',
    )
    for (const a of rows) {
      const link = linkById.get(a.id)
      if (!link) continue
      out.push({
        assessmentId: a.id,
        unitId: a.unit_id,
        key: link.key,
        index: link.index,
        dueDate: a.due_date,
        amount: Number(a.amount),
        paid: (a.payments ?? []).reduce((s, p) => s + Number(p.amount), 0),
        status: a.status,
        deleted: a.deleted_at !== null,
      })
    }
  }
  return out
}

/** Progress for each plan (by id) on the association's `today`. */
export async function loadPlanProgress(
  db: PlanDb,
  associationId: string,
  plans: readonly PlanRecord[],
  today: string,
): Promise<Map<string, PlanProgress>> {
  const installments = await loadInstallments(db, associationId, plans)
  const grouped = installmentsByPlan(plans, installments)
  const out = new Map<string, PlanProgress>()
  for (const p of plans) out.set(p.id, planProgress(p, grouped.get(p.id) ?? [], today))
  return out
}

type PlanRow = {
  id: string
  unit_id: string
  installment_count: number
  status: string
  unit: { association_id: string } | null
}

/** Active plans on the association's units (optionally only `unitIds`). */
export async function loadActivePlans(
  db: PlanDb,
  input: { organizationId: string; associationId: string; unitIds?: readonly string[] },
): Promise<PlanRecord[]> {
  const read = (ids?: string[]) =>
    readAll<PlanRow>((from, to) => {
      let q = db
        .from('payment_plans')
        .select('id, unit_id, installment_count, status, unit:unit_id(association_id)')
        .eq('organization_id', input.organizationId)
        .eq('status', 'active')
      if (ids) q = q.in('unit_id', ids)
      return q.order('id', { ascending: true }).range(from, to)
    }, 'payment plans')

  const rows: PlanRow[] = []
  if (input.unitIds) {
    for (const ids of chunks([...new Set(input.unitIds)])) rows.push(...(await read(ids)))
  } else {
    rows.push(...(await read()))
  }
  return rows
    .filter((r) => r.unit?.association_id === input.associationId)
    .map((r) => ({ id: r.id, unitId: r.unit_id, installmentCount: Number(r.installment_count), status: r.status }))
}

export interface CompletePlansInput {
  organizationId: string
  associationId: string
  /** The association's calendar day — the completion day recorded. */
  today: string
  /** Who recorded the payment; null for the nightly run. */
  actorUserId: string | null
  /** Scope to these units (the paying unit). Omit for every unit. */
  unitIds?: readonly string[]
  trigger: 'payment' | 'nightly'
}

export interface CompletePlansResult {
  checked: number
  completed: string[]
  /** Plans paid off but whose audit row failed to write. */
  auditFailed: number
}

export async function completePaidOffPlans(db: PlanDb, input: CompletePlansInput): Promise<CompletePlansResult> {
  const plans = await loadActivePlans(db, input)
  const result: CompletePlansResult = { checked: plans.length, completed: [], auditFailed: 0 }
  if (plans.length === 0) return result

  const progress = await loadPlanProgress(db, input.associationId, plans, input.today)
  for (const plan of plans) {
    const p = progress.get(plan.id)
    if (!p || p.standing !== 'paid_off') continue

    const { data: claimed, error } = await db
      .from('payment_plans')
      .update({ status: 'completed' })
      .eq('id', plan.id)
      .eq('status', 'active')
      .select('id')
    if (error) throw new Error(`payment-plans: completing a plan failed (${(error as QueryError).code ?? 'unknown'})`)
    if (!claimed || (claimed as unknown[]).length === 0) continue // another run got it

    result.completed.push(plan.id)
    const { error: auditErr } = await db.from('audit_log').insert({
      org_id: input.organizationId,
      user_id: input.actorUserId,
      action: PLAN_COMPLETED_ACTION,
      entity_type: PLAN_AUDIT_ENTITY,
      entity_id: plan.id,
      metadata: {
        completed_on: input.today,
        unit_id: plan.unitId,
        installments: p.found,
        trigger: input.trigger,
      },
    })
    if (auditErr) result.auditFailed += 1
  }
  return result
}

/** The completion day of each plan id, from its audit row. */
export async function loadCompletionDays(
  db: PlanDb,
  organizationId: string,
  planIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const ids of chunks([...planIds])) {
    const rows = await readAll<{ entity_id: string | null; created_at: string | null; metadata: { completed_on?: unknown } | null }>(
      (from, to) =>
        db
          .from('audit_log')
          .select('entity_id, created_at, metadata')
          .eq('org_id', organizationId)
          .eq('action', PLAN_COMPLETED_ACTION)
          .eq('entity_type', PLAN_AUDIT_ENTITY)
          .in('entity_id', ids)
          .order('id', { ascending: true })
          .range(from, to),
      'plan completions',
    )
    for (const r of rows) {
      if (!r.entity_id) continue
      const day =
        typeof r.metadata?.completed_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.metadata.completed_on)
          ? r.metadata.completed_on
          : r.created_at?.slice(0, 10)
      if (day) out.set(r.entity_id, day)
    }
  }
  return out
}
