'use server'

import { z } from 'zod'
import { generateBudgetNarrative } from '@homeowner-portal/ai'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { chargeAiActionQuota } from '@/lib/api/ai-action-quota'
import { createBudget, saveBudgetLineItems } from '@/lib/budgets'
import { mainChanges, totalsOf, wholeUsd, MAX_INFLATION_PCT, type DraftChange } from '@/lib/accounting/budget-draft'
import { fieldErrorsOf } from '@/lib/field-errors'

// BL-029 — save the board's reviewed draft, and the optional AI summary.
//
// Saving reuses the existing budget create path: createBudget makes the
// DRAFT row (same unique-per-year rule, same gate) and saveBudgetLineItems
// writes the lines. Nothing here writes to the database directly.

export type SaveDraftBudgetResult =
  | { ok: true; budgetId: string }
  | { ok: false; error: string; budgetId?: string; fieldErrors?: Record<string, string> }

const SaveDraftSchema = z.object({
  fiscalPeriodId: z.string().uuid('Pick the year to save the draft to.'),
  fundId: z.string().uuid(),
  /** Set on a retry after the budget was created but its lines failed. */
  budgetId: z.string().uuid().optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        amount: z.number().min(0, 'Amounts can’t be negative.').max(10_000_000),
        note: z.string(),
      }),
    )
    .max(1000),
})

export async function saveDraftBudget(input: z.input<typeof SaveDraftSchema>): Promise<SaveDraftBudgetResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = SaveDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input', fieldErrors: fieldErrorsOf(parsed.error) }
  }
  const { fiscalPeriodId, fundId, lines } = parsed.data

  let budgetId = parsed.data.budgetId
  if (!budgetId) {
    const created = await createBudget({ fiscalPeriodId, fundId })
    if (!created.ok) return { ok: false, error: created.error }
    budgetId = created.budgetId
  }

  // $0 lines are left off, as a hand-built budget would; the reason the
  // draft gave each line is kept as its note.
  const saved = await saveBudgetLineItems({
    budgetId,
    lineItems: lines
      .filter((l) => l.amount > 0)
      .map((l) => ({ accountId: l.accountId, amount: l.amount, notes: l.note.slice(0, 500) || undefined })),
  })
  if (!saved.ok) {
    return {
      ok: false,
      budgetId,
      error: 'The draft budget was created, but its lines didn’t save. Select Save again to retry — nothing is lost.',
    }
  }
  return { ok: true, budgetId }
}

// ─── AI summary ──────────────────────────────────────────────────────

export type SummarizeDraftResult =
  | { ok: true; narrative: string | null; changes: DraftChange[] }
  | { ok: false; error: string }

const SummarizeSchema = z.object({
  yearLabel: z.string().min(1).max(40),
  fundName: z.string().min(1).max(80),
  inflationPct: z.number().min(0).max(MAX_INFLATION_PCT),
  lines: z
    .array(
      z.object({
        accountName: z.string().min(1).max(120),
        accountType: z.enum(['income', 'expense']),
        priorBudget: z.number().nullable(),
        amount: z.number().min(0).max(10_000_000),
      }),
    )
    .max(1000),
})

const signed = (n: number) => (n >= 0 ? `+${wholeUsd(n)}` : wholeUsd(n))

/**
 * "Main changes vs last year". The totals and the change list are computed
 * here from the amounts on screen; the model receives them as finished text
 * and writes prose only. A reply with a figure of its own is discarded by
 * generateBudgetNarrative, leaving the computed list.
 */
export async function summarizeDraftBudget(input: z.input<typeof SummarizeSchema>): Promise<SummarizeDraftResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = SummarizeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'The draft couldn’t be summarized. Reload the page and try again.' }
  const { yearLabel, fundName, inflationPct, lines } = parsed.data

  const totals = totalsOf(lines.map((l) => ({ type: l.accountType, amount: l.amount, prior: l.priorBudget ?? 0 })))
  const changes = mainChanges(lines.map((l) => ({ ...l, suggested: l.amount })))

  // BL-112: the board's AI budget summary → `board_ai`.
  const quota = await chargeAiActionQuota('board_ai', gate.orgId)
  if (!quota.ok) return { ok: false, error: quota.error }

  try {
    const narrative = await generateBudgetNarrative({
      yearLabel,
      fundName,
      inflationPct,
      totals: {
        income: wholeUsd(totals.income),
        expense: wholeUsd(totals.expense),
        net: wholeUsd(totals.net),
        priorIncome: wholeUsd(totals.priorIncome),
        priorExpense: wholeUsd(totals.priorExpense),
      },
      changes: changes.map((c) => ({ accountName: c.accountName, from: wholeUsd(c.from), to: wholeUsd(c.to), change: signed(c.change) })),
    })
    return { ok: true, narrative, changes }
  } catch (err) {
    // The error type only: a model or provider message can quote the figures back.
    console.error('[budget-draft] summary failed', err instanceof Error ? err.name : 'UnknownError')
    return { ok: false, error: 'The AI summary isn’t available right now. The list of changes below is complete without it.' }
  }
}
