'use server'

// BL-177 follow-up (M7_APPLIED): the board applies some or all of a home's
// unapplied credit to one of its open charges. One database call
// (apply_unapplied_credit, migration 0072): it re-checks board/admin of the
// org, that the credit and the charge are on the same home in this org, and
// refuses to over-apply either; a failure leaves nothing changed.
// Audit rows are written by the function (ids and cents only).

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { booksNotOpen, type BooksNotOpenFailure } from '@/lib/accounting/books-not-open'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

const Schema = z.object({
  creditId: z.string().uuid(),
  assessmentId: z.string().uuid(),
  cents: z.number().int().positive().max(100_000_000),
})

export type ApplyCreditResult = { ok: true; cents: number } | { ok: false; error: string } | BooksNotOpenFailure

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}

export async function applyCreditToCharge(input: { creditId: string; assessmentId: string; cents: number }): Promise<ApplyCreditResult> {
  if (!M7_APPLIED) return { ok: false, error: 'Applying credit isn’t available yet.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a charge and an amount in dollars and cents.' }
  const v = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data, error } = await (supabase as unknown as RpcClient).rpc('apply_unapplied_credit', {
    p_org: gate.orgId,
    p_credit: v.creditId,
    p_assessment: v.assessmentId,
    p_cents: v.cents,
  })
  if (error) {
    console.error('[apply-credit] rpc failed', { code: error.code ?? null })
    if ((error.message ?? '').includes('books_not_open')) return booksNotOpen(gate.role)
    if (error.code === '23514') return { ok: false, error: 'That is more than the credit or the charge has left. Nothing was changed.' }
    if (error.code === '23503' || error.code === '22023') return { ok: false, error: 'That credit or charge changed. Reload and try again. Nothing was changed.' }
    if (error.code === '42501') return { ok: false, error: BOARD_ONLY_DENIED }
    return { ok: false, error: 'Couldn’t apply the credit. Nothing was changed. Try again.' }
  }

  const out = (data ?? {}) as { payment_id?: string }
  // Best effort, like a recorded payment: a payment plan that is now paid off, and the receipt.
  try {
    const { data: unitRow } = (await supabase
      .from('unapplied_credits' as never)
      .select('unit_id')
      .eq('id', v.creditId)
      .maybeSingle()) as unknown as { data: { unit_id: string } | null }
    const { completePlansAfterPayment } = await import('@/lib/accounting/plan-completion')
    await completePlansAfterPayment(supabase as never, {
      organizationId: gate.orgId,
      associationId: assoc.id,
      unitId: unitRow?.unit_id ?? null,
      today: todayIn(assoc.timeZone),
    })
    if (out.payment_id) {
      const { queuePaymentReceiptAfterResponse } = await import('@/lib/resident-notify/receipt-notify')
      queuePaymentReceiptAfterResponse(supabase, { paymentId: out.payment_id, associationId: assoc.id })
    }
  } catch (err) {
    console.error('[apply-credit] follow-up failed', { error: err instanceof Error ? err.name : 'unknown' })
  }

  revalidatePath('/dues')
  revalidatePath('/properties')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, cents: v.cents }
}
