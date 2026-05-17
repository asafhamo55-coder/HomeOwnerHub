'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { loadAccountingRefs, postJournalEntry } from '@homeowner-portal/db'
import { memoCodeFor } from '@homeowner-portal/workflows'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

type AssessmentInsert = Database['public']['Tables']['assessments']['Insert']
type PaymentInsert = Database['public']['Tables']['payments']['Insert']

export type AssessmentActionResult =
  | { ok: true; created?: number; assessmentId?: string }
  | { ok: false; error: string }

// ─── materialize ─────────────────────────────────────────────────────

const MaterializeSchema = z.object({
  amountPerUnit: z.number().positive().max(100_000),
})

/**
 * Generate a 'regular' assessment for every unit in the association for
 * the current open fiscal period. Each assessment is paired with a
 * Dr AR / Cr Assessment Income journal entry in the OPERATING fund.
 *
 * Idempotent: a unit that already has a 'regular' assessment in this
 * period is skipped. Partial failures (one unit's JE fails) leave the
 * earlier units committed — there's no cross-unit transaction here
 * because assessments are independent obligations.
 */
export async function materializeCurrentPeriodAssessments(input: {
  amountPerUnit: number
}): Promise<AssessmentActionResult> {
  const parsed = MaterializeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  // Resolve org_id, slug (memo-code generator needs it), open period,
  // accounting refs.
  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id, slug')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id, start_date, end_date')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) {
    return {
      ok: false,
      error: 'No open fiscal period — run pnpm seed:accounting first.',
    }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) {
    return {
      ok: false,
      error: 'Accounting not set up — run pnpm seed:accounting.',
    }
  }

  // Find units missing this period's regular assessment. unit_number
  // feeds the memo-code generator; unit_id is the fallback when null.
  const [{ data: units }, { data: existing }] = await Promise.all([
    supabase
      .from('units')
      .select('id, unit_number')
      .eq('association_id', assoc.id),
    supabase
      .from('assessments')
      .select('unit_id')
      .eq('association_id', assoc.id)
      .eq('fiscal_period_id', period.id)
      .eq('assessment_type', 'regular'),
  ])

  if (!units || units.length === 0) {
    return { ok: false, error: 'Add units before generating assessments.' }
  }

  const alreadyHave = new Set((existing ?? []).map((r) => r.unit_id))
  const toMaterialize = units.filter((u) => !alreadyHave.has(u.id))
  if (toMaterialize.length === 0) {
    return {
      ok: false,
      error: `Assessments for this period are already on file.`,
    }
  }

  // Pick a due date — first day of the period's month grouping doesn't
  // generalize; default to the 15th of the period's start month.
  const dueDate = `${period.start_date.slice(0, 7)}-15`

  // One assessment + one JE per unit. Sequential — the entry_number
  // generator queries max+1 each time and would race itself otherwise.
  let created = 0
  for (const u of toMaterialize) {
    const memoCode = memoCodeFor({
      associationSlug: assocRow.slug,
      unitNumber: u.unit_number,
      unitId: u.id,
      assessmentType: 'regular',
    })
    const insertPayload: AssessmentInsert = {
      organization_id: assocRow.organization_id,
      association_id: assoc.id,
      unit_id: u.id,
      fiscal_period_id: period.id,
      assessment_type: 'regular',
      amount: parsed.data.amountPerUnit,
      due_date: dueDate,
      memo_code: memoCode,
      status: 'open',
    }
    const { data: inserted, error: insertErr } = await supabase
      .from('assessments')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return {
        ok: false,
        error: `unit ${u.id}: ${insertErr?.message ?? 'insert failed'}`,
      }
    }

    const je = await postJournalEntry(supabase, {
      organizationId: assocRow.organization_id,
      associationId: assoc.id,
      fiscalPeriodId: period.id,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Assessment billed: regular dues for unit ${u.id.slice(0, 8)}`,
      source: 'ar_payment',
      sourceId: inserted.id,
      lines: [
        {
          accountId: refs.acctAR,
          fundId: refs.fundOperating,
          debit: parsed.data.amountPerUnit,
          credit: 0,
        },
        {
          accountId: refs.acctAssessmentIncome,
          fundId: refs.fundOperating,
          debit: 0,
          credit: parsed.data.amountPerUnit,
        },
      ],
    })

    if (!je.ok) {
      // Don't leave a billed assessment without its matching JE — that
      // would silently break trial balance.
      await supabase.from('assessments').delete().eq('id', inserted.id)
      return { ok: false, error: `unit ${u.id} JE failed: ${je.error}` }
    }

    created += 1
  }

  revalidatePath('/dues')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, created }
}

// ─── mark paid ───────────────────────────────────────────────────────

const MarkPaidSchema = z.object({
  assessmentId: z.string().uuid(),
  amountPaid: z.number().positive().optional(),
  paymentMethod: z
    .enum(['ach', 'card', 'apple_pay', 'google_pay', 'zelle_assisted', 'check', 'cash', 'other'])
    .default('other'),
  externalRef: z.string().max(120).optional(),
})

/**
 * Record a payment against an assessment. Posts the cash-receipt JE
 * (Dr Cash / Cr AR) and links it back to the payments row. The
 * assessment status flips to 'partial' if amountPaid < amount, otherwise
 * 'paid'. Overpayments collapse to 'paid' — overage handling lands when
 * payment_plans is wired in Phase 4+.
 */
export async function markAssessmentPaid(input: {
  assessmentId: string
  amountPaid?: number
  paymentMethod?:
    | 'ach' | 'card' | 'apple_pay' | 'google_pay'
    | 'zelle_assisted' | 'check' | 'cash' | 'other'
  externalRef?: string
}): Promise<AssessmentActionResult> {
  const parsed = MarkPaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: assessment, error: aerr } = await supabase
    .from('assessments')
    .select('id, organization_id, association_id, unit_id, fiscal_period_id, amount, status')
    .eq('id', parsed.data.assessmentId)
    .eq('association_id', assoc.id)
    .single()
  if (aerr || !assessment) {
    return { ok: false, error: aerr?.message ?? 'assessment not found' }
  }
  if (assessment.status === 'paid' || assessment.status === 'waived' || assessment.status === 'written_off') {
    return { ok: false, error: `assessment already ${assessment.status}` }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) {
    return { ok: false, error: 'Accounting not set up — run pnpm seed:accounting.' }
  }

  const amountToPay = parsed.data.amountPaid ?? Number(assessment.amount)
  const newStatus = amountToPay >= Number(assessment.amount) ? 'paid' : 'partial'
  const paidAt = new Date().toISOString()

  // Payments row first — JE will link back via update.
  const paymentInsert: PaymentInsert = {
    organization_id: assessment.organization_id,
    unit_id: assessment.unit_id,
    assessment_id: assessment.id,
    amount: amountToPay,
    payment_method: parsed.data.paymentMethod,
    external_ref: parsed.data.externalRef ?? null,
    paid_at: paidAt,
  }
  const { data: payment, error: perr } = await supabase
    .from('payments')
    .insert(paymentInsert)
    .select('id')
    .single()
  if (perr || !payment) {
    return { ok: false, error: `payment insert: ${perr?.message}` }
  }

  const je = await postJournalEntry(supabase, {
    organizationId: assessment.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: assessment.fiscal_period_id,
    entryDate: paidAt.slice(0, 10),
    memo: `Payment received against assessment ${assessment.id.slice(0, 8)}`,
    source: 'ar_payment',
    sourceId: payment.id,
    lines: [
      {
        accountId: refs.acctCashOperating,
        fundId: refs.fundOperating,
        debit: amountToPay,
        credit: 0,
      },
      {
        accountId: refs.acctAR,
        fundId: refs.fundOperating,
        debit: 0,
        credit: amountToPay,
      },
    ],
  })

  if (!je.ok) {
    // Roll back the payments row so the homeowner record doesn't show
    // a payment that left no trace in the ledger.
    await supabase.from('payments').delete().eq('id', payment.id)
    return { ok: false, error: `JE failed: ${je.error}` }
  }

  await supabase
    .from('payments')
    .update({ journal_entry_id: je.journalEntryId })
    .eq('id', payment.id)

  await supabase
    .from('assessments')
    .update({ status: newStatus })
    .eq('id', assessment.id)

  revalidatePath('/dues')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, assessmentId: assessment.id }
}
