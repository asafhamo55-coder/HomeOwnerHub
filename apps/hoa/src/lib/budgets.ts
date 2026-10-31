'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getPrimaryAssociation } from '@/lib/vendors'
import { fieldErrorsOf } from '@/lib/field-errors'
import { accountingActionFailed } from '@/lib/accounting-action-error'

type BudgetInsert = Database['public']['Tables']['budgets']['Insert']
type LineItemInsert = Database['public']['Tables']['budget_line_items']['Insert']

export type BudgetActionResult =
  | { ok: true; budgetId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

// ─── createBudget ────────────────────────────────────────────────────

const CreateBudgetSchema = z.object({
  fiscalPeriodId: z.string().uuid(),
  fundId: z.string().uuid(),
})

/**
 * Create an empty draft budget for one period + fund. The
 * (association, period, fund, status) UNIQUE constraint prevents two
 * drafts coexisting — by spec §13.1 #5 there's at most one active
 * budget per slice. To create a new revision, archive the prior one
 * first.
 */
export async function createBudget(input: {
  fiscalPeriodId: string
  fundId: string
}): Promise<BudgetActionResult> {
  const parsed = CreateBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'invalid input',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  const payload: BudgetInsert = {
    organization_id: assocRow.organization_id,
    association_id: assoc.id,
    fiscal_period_id: parsed.data.fiscalPeriodId,
    fund_id: parsed.data.fundId,
    status: 'draft',
  }
  const { data, error } = await supabase
    .from('budgets')
    .insert(payload)
    .select('id')
    .single()
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: 'A budget for that period and fund already exists.' }
    }
    return accountingActionFailed('createBudget', error)
  }

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/accounting/budget')
  return { ok: true, budgetId: data.id }
}

// ─── deleteBudget ───────────────────────────────────────────────────

export async function deleteBudget(
  budgetId: string,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: budget } = await supabase
    .from('budgets')
    .select('id, status')
    .eq('id', budgetId)
    .eq('association_id', assoc.id)
    .single()
  if (!budget) return { ok: false, error: 'Budget not found.' }

  if (budget.status === 'approved') {
    return { ok: false, error: 'Cannot delete an approved budget. Archive it instead.' }
  }

  const { error } = await supabase
    .from('budgets')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', budgetId)
    .is('deleted_at', null)
  if (error) return accountingActionFailed('deleteBudget', error)

  revalidatePath('/accounting/budget')
  return { ok: true }
}

// ─── saveBudgetLineItems ─────────────────────────────────────────────

const SaveLineItemsSchema = z.object({
  budgetId: z.string().uuid(),
  lineItems: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().min(0).max(10_000_000),
        notes: z.string().max(500).optional(),
      }),
    )
    .max(1000),
})

/**
 * Replace the budget's entire line-item set. Caller passes the desired
 * final state; we delete existing lines and insert the new ones in one
 * transaction-of-two-statements. (No real transactional guarantee
 * without an RPC, but the surface here is small and a partial state is
 * recoverable by re-saving.)
 *
 * Budgets in 'approved' status cannot be edited; UI gates this too but
 * the server check is authoritative.
 */
export async function saveBudgetLineItems(input: {
  budgetId: string
  lineItems: { accountId: string; amount: number; notes?: string }[]
}): Promise<BudgetActionResult> {
  const parsed = SaveLineItemsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'invalid input',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, status, association_id')
    .eq('id', parsed.data.budgetId)
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
    .single()
  if (!budget) return { ok: false, error: 'Budget not found.' }
  if (budget.status === 'approved' || budget.status === 'archived') {
    return { ok: false, error: `budget is ${budget.status}; cannot edit` }
  }

  // Insert the new lines first and only then remove the old ones, so a
  // failed save never leaves the budget empty.
  const { data: oldLines, error: readErr } = await supabase
    .from('budget_line_items')
    .select('id')
    .eq('budget_id', parsed.data.budgetId)
  if (readErr) return accountingActionFailed('saveBudgetLineItems.read', readErr)
  const oldIds = (oldLines ?? []).map((r) => r.id as string)

  let newIds: string[] = []
  if (parsed.data.lineItems.length > 0) {
    const inserts: LineItemInsert[] = parsed.data.lineItems.map((l) => ({
      budget_id: parsed.data.budgetId,
      account_id: l.accountId,
      amount: l.amount,
      notes: l.notes ?? null,
    }))
    const { data: inserted, error: insErr } = await supabase
      .from('budget_line_items')
      .insert(inserts)
      .select('id')
    if (insErr) return accountingActionFailed('saveBudgetLineItems.insert', insErr)
    newIds = (inserted ?? []).map((r) => r.id as string)
  }

  if (oldIds.length > 0) {
    const { error: delErr } = await supabase
      .from('budget_line_items')
      .delete()
      .in('id', oldIds)
    if (delErr) {
      // Roll back the rows just added so the budget isn't doubled.
      if (newIds.length > 0) {
        await supabase.from('budget_line_items').delete().in('id', newIds)
      }
      return accountingActionFailed(
        'saveBudgetLineItems.delete',
        delErr,
        'Couldn’t save the budget lines. Your earlier lines are unchanged. Try again.',
      )
    }
  }

  revalidatePath(`/accounting/budget/${parsed.data.budgetId}`)
  revalidatePath('/accounting/budget')
  return { ok: true, budgetId: parsed.data.budgetId }
}

// ─── approveBudget ───────────────────────────────────────────────────

const ApproveBudgetSchema = z.object({
  budgetId: z.string().uuid(),
})

export async function approveBudget(input: {
  budgetId: string
}): Promise<BudgetActionResult> {
  const parsed = ApproveBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'invalid input',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }

  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, status')
    .eq('id', parsed.data.budgetId)
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
    .single()
  if (!budget) return { ok: false, error: 'Budget not found.' }
  if (budget.status !== 'draft') {
    return { ok: false, error: `budget is ${budget.status}; only drafts can be approved` }
  }

  const { error } = await supabase
    .from('budgets')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', parsed.data.budgetId)
  if (error) return accountingActionFailed('approveBudget', error)

  revalidatePath(`/accounting/budget/${parsed.data.budgetId}`)
  revalidatePath('/accounting/budget')
  return { ok: true, budgetId: parsed.data.budgetId }
}
