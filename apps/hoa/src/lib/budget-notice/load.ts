import type { AccountingContext } from '@/lib/accounting/queries'
import { getBudget, queryFailed } from '@/lib/accounting/queries'
import { dayOf, todayIn } from '@/lib/association-time'
import { listBillableUnits } from '@/lib/properties/lot'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import type { BudgetNoticeInput, RegularCharge } from './model'

/**
 * Everything the owner budget notice needs (BL-091), read with the
 * caller's cookie-bound client so RLS applies on top of the board gate.
 * Throws on any failed read — a notice sent to every owner must not be
 * built from a partial assessment schedule — and returns `null` when the
 * budget isn't this association's.
 */
export async function loadBudgetNoticeInput(
  ctx: AccountingContext,
  budgetId: string,
): Promise<{ input: BudgetNoticeInput; today: string } | null> {
  const budget = await getBudget(ctx.associationId, budgetId)
  if (!budget) return null

  const supabase = await getSupabaseServerClient()
  const { data: assoc, error: assocErr } = await supabase
    .from('associations')
    .select('name, state, governing_law_state')
    .eq('id', ctx.associationId)
    .maybeSingle()
  if (assocErr) throw queryFailed(assocErr)

  // The billable homes, and the regular charges billed for the budget's
  // fiscal period (the "assessment schedule").
  const periodId = budget.fiscalPeriod?.id ?? null
  const [units, charges] = await Promise.all([
    listBillableUnits(supabase, ctx.organizationId, ctx.associationId),
    periodId
      ? readAll<{ id: string; unit_id: string; amount: number; due_date: string }>(
          (from, to) =>
            supabase
              .from('assessments')
              .select('id, unit_id, amount, due_date')
              .eq('association_id', ctx.associationId)
              .eq('fiscal_period_id', periodId)
              .eq('assessment_type', 'regular')
              .is('deleted_at', null)
              .order('id', { ascending: true })
              .range(from, to),
          queryFailed,
        )
      : Promise.resolve([]),
  ])

  // Only homes that are still billable count toward the schedule.
  const billable = new Set<string>(units.map((u) => u.id as string))
  const regularCharges: RegularCharge[] = charges
    .filter((c) => billable.has(c.unit_id))
    .map((c) => ({ unitId: c.unit_id, amount: Number(c.amount), dueDate: c.due_date }))

  const state = (assoc?.governing_law_state ?? assoc?.state ?? '').trim().toUpperCase() || null
  return {
    today: todayIn(ctx.timeZone),
    input: {
      budgetId: budget.id,
      status: budget.status,
      associationName: assoc?.name ?? ctx.associationName ?? null,
      state,
      fundName: budget.fund?.name ?? null,
      period: budget.fiscalPeriod ? { start_date: budget.fiscalPeriod.start_date, end_date: budget.fiscalPeriod.end_date } : null,
      approvedDay: dayOf(budget.approved_at, ctx.timeZone),
      lines: budget.lineItems.map((l) => ({
        accountNumber: l.accountNumber,
        accountName: l.accountName,
        accountType: l.accountType,
        amount: l.amount,
      })),
      billableUnits: units.length,
      regularCharges,
    },
  }
}
