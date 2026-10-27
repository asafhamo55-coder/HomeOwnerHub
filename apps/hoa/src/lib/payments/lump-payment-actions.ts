'use server'

// BL-163: "Record a payment" for a Georgia home. The board types one
// amount; the split across the home's open charges follows O.C.G.A.
// § 43-17A-8 from 2027-01-01 (oldest due first before that), is shown
// before anything is saved, and each part posts through the existing
// markAssessmentPaid path (payments row + cash-receipt journal entry).
//
// Board/admin only: both actions re-check the role before any client
// exists, because a server action is a public endpoint. The browser never
// sends a split to trust: record rebuilds it from fresh reads and refuses
// if it differs from what the board saw. Nothing already recorded is
// re-allocated or edited. Money beyond what is currently due is NOT
// recorded (payments need a charge, and there is no unapplied-credit
// store); the board is told to record it against a charge it chooses.
//
// Audit rows carry ids, cents and codes only: no names, addresses or notes.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { loadInstallments } from '@homeowner-portal/workflows/payment-plans'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { isBooksNotOpen, type BooksNotOpenFailure } from '@/lib/accounting/books-not-open'
import { markAssessmentPaid } from '@/lib/assessments'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import { type OpenCharge } from '@/lib/collections/ga-payment-order'
import {
  LUMP_PAYMENT_AUDIT_ACTION,
  buildLumpPreview,
  sameSplit,
  toCents,
  type ExpectedSplit,
  type LumpPreview,
} from './lump-payment'

const METHODS = ['ach', 'card', 'apple_pay', 'google_pay', 'zelle_assisted', 'check', 'cash', 'other'] as const

const PreviewSchema = z.object({
  unitId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
})

const RecordSchema = PreviewSchema.extend({
  paymentMethod: z.enum(METHODS).default('other'),
  externalRef: z.string().max(120).optional(),
  expected: z
    .array(z.object({ chargeId: z.string().uuid(), cents: z.number().int().positive() }))
    .max(500),
})

export type PreviewLumpResult = { ok: true; preview: LumpPreview } | { ok: false; error: string }

export type RecordLumpResult =
  | { ok: true; recordedCents: number; chargeCount: number }
  | { ok: false; error: string; recordedCents?: number; chargeCount?: number }
  | BooksNotOpenFailure

const NOT_GA = 'Recording one payment across charges is for Georgia associations. Use Mark paid on the charge instead.'
const LOAD_FAILED = 'Couldn’t load this home’s charges. Try again.'

const wholeCents = (dollars: number) => Math.abs(dollars * 100 - Math.round(dollars * 100)) < 1e-6

type Loaded =
  | { ok: false; error: string }
  | {
      ok: true
      orgId: string
      associationId: string
      state: string
      today: string
      charges: OpenCharge[]
    }

/** Fresh reads for one home, with the caller's cookie-bound client so RLS applies on top of the gate. */
async function loadHome(orgId: string, unitId: string): Promise<Loaded> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: arows, error: aerr } = await supabase
    .from('associations')
    .select('state, governing_law_state')
    .eq('id', assoc.id)
  if (aerr) {
    console.error('[lump-payment] association read failed', { code: aerr.code ?? null })
    return { ok: false, error: LOAD_FAILED }
  }
  const a = ((arows ?? []) as Array<{ state: string | null; governing_law_state: string | null }>)[0]
  const state = (a?.governing_law_state ?? a?.state ?? '').trim().toUpperCase()
  if (state !== 'GA') return { ok: false, error: NOT_GA }

  const { data: unit, error: uerr } = await supabase
    .from('units')
    .select('id')
    .eq('id', unitId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (uerr) {
    console.error('[lump-payment] unit read failed', { code: uerr.code ?? null })
    return { ok: false, error: LOAD_FAILED }
  }
  if (!unit) return { ok: false, error: 'That home isn’t in this association.' }

  const { data: rows, error: cerr } = await supabase
    .from('assessments')
    .select('id, assessment_type, due_date, amount, status, payments(amount)')
    .eq('association_id', assoc.id)
    .eq('unit_id', unitId)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
    .order('id', { ascending: true })
    .range(0, 999)
  if (cerr) {
    console.error('[lump-payment] charges read failed', { code: cerr.code ?? null })
    return { ok: false, error: LOAD_FAILED }
  }
  const list = (rows ?? []) as unknown as Array<{
    id: string
    assessment_type: string
    due_date: string
    amount: number
    payments: Array<{ amount: number }> | null
  }>
  // A capped read would split a payment over part of the account.
  if (list.length >= 1000) return { ok: false, error: 'This home has more open charges than can be split here. Use Mark paid on each charge.' }

  // Which charges are payment-plan installments (stored as 'special', but the
  // statute doesn't say where they rank). A failed read refuses, never guesses.
  let installmentIds: Set<string>
  try {
    const inst = await loadInstallments(supabase as never, assoc.id)
    installmentIds = new Set(inst.map((i) => i.assessmentId))
  } catch (err) {
    console.error('[lump-payment] installment read failed', { error: err instanceof Error ? err.message.slice(0, 80) : 'unknown' })
    return { ok: false, error: LOAD_FAILED }
  }

  const charges: OpenCharge[] = list.map((r) => {
    const paid = (r.payments ?? []).reduce((s, p) => s + toCents(p.amount), 0)
    return {
      id: r.id,
      type: r.assessment_type,
      dueDate: r.due_date,
      remainingCents: Math.max(0, toCents(r.amount) - paid),
      planInstallment: installmentIds.has(r.id),
    }
  })
  return { ok: true, orgId, associationId: assoc.id, state, today: todayIn(assoc.timeZone), charges }
}

export async function previewLumpPayment(input: { unitId: string; amount: number }): Promise<PreviewLumpResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = PreviewSchema.safeParse(input)
  if (!parsed.success || !wholeCents(parsed.data.amount)) return { ok: false, error: 'Enter an amount in dollars and cents, more than $0.' }

  const home = await loadHome(gate.orgId, parsed.data.unitId)
  if (!home.ok) return home
  const preview = buildLumpPreview({
    state: home.state,
    today: home.today,
    amountCents: toCents(parsed.data.amount),
    charges: home.charges,
  })
  return { ok: true, preview }
}

export async function recordLumpPayment(input: {
  unitId: string
  amount: number
  paymentMethod?: (typeof METHODS)[number]
  externalRef?: string
  expected: ExpectedSplit[]
}): Promise<RecordLumpResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = RecordSchema.safeParse(input)
  if (!parsed.success || !wholeCents(parsed.data.amount)) return { ok: false, error: 'Enter an amount in dollars and cents, more than $0.' }
  const { unitId, paymentMethod, externalRef, expected } = parsed.data

  const home = await loadHome(gate.orgId, unitId)
  if (!home.ok) return home
  const preview = buildLumpPreview({
    state: home.state,
    today: home.today,
    amountCents: toCents(parsed.data.amount),
    charges: home.charges,
  })

  if (preview.lines.length === 0) return { ok: false, error: 'Nothing is due on this home right now, so there is nothing to apply this payment to.' }
  if (preview.unappliedCents > 0) {
    return {
      ok: false,
      error: 'That is more than is currently due on this home. Enter up to the amount due, then record the rest on a charge you choose with Mark paid.',
    }
  }
  if (!sameSplit(expected, preview)) {
    return { ok: false, error: 'The home’s charges changed since you previewed the split. Preview again before saving.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // One markAssessmentPaid per charge, in the statute's order. Stops at the
  // first failure so the board sees exactly how far it got; what was posted
  // stays posted (each part is its own ledger entry).
  let recordedCents = 0
  let chargeCount = 0
  const recorded: Array<{ id: string; cents: number }> = []
  let failure: RecordLumpResult | null = null
  for (const line of preview.lines) {
    const r = await markAssessmentPaid({
      assessmentId: line.chargeId,
      amountPaid: line.appliedCents / 100,
      paymentMethod,
      externalRef,
    })
    if (isBooksNotOpen(r)) {
      failure = r
      break
    }
    if (!r.ok) {
      failure = { ok: false, error: r.error }
      break
    }
    recordedCents += line.appliedCents
    chargeCount += 1
    recorded.push({ id: line.chargeId, cents: line.appliedCents })
    // markAssessmentPaid compares to the charge's full amount, so clearing the
    // rest of a part-paid charge leaves it 'partial'. Close it here.
    if (line.remainingAfterCents === 0) {
      const { error: serr } = await supabase
        .from('assessments')
        .update({ status: 'paid' })
        .eq('id', line.chargeId)
        .eq('association_id', home.associationId)
        .in('status', ['open', 'partial'])
      if (serr) console.error('[lump-payment] close charge failed', { chargeId: line.chargeId, code: serr.code ?? null })
    }
  }

  if (recorded.length > 0) {
    const { error: auditErr } = await supabase.from('audit_log').insert({
      org_id: gate.orgId,
      user_id: user?.id ?? null,
      action: LUMP_PAYMENT_AUDIT_ACTION,
      entity_type: 'unit',
      entity_id: unitId,
      metadata: {
        mode: preview.mode,
        state: home.state,
        method: paymentMethod,
        total_cents: preview.totalCents,
        recorded_cents: recordedCents,
        complete: failure === null,
        charges: recorded.map((r) => ({ id: r.id, cents: r.cents })),
        ambiguity_codes: preview.ambiguities.map((x) => x.code),
      },
    })
    if (auditErr) console.error('[lump-payment] audit failed', { unitId, code: auditErr.code ?? null })
  }

  revalidatePath('/dues')
  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')

  if (failure) {
    if (isBooksNotOpen(failure)) return failure
    return {
      ok: false,
      error:
        recordedCents > 0
          ? `${failure.error} Part of the payment was recorded; preview again to see what is left.`
          : failure.error,
      recordedCents,
      chargeCount,
    }
  }
  return { ok: true, recordedCents, chargeCount }
}
