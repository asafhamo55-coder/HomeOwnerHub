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
  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, created }
}

// ─── add due (manual create) ─────────────────────────────────────────

const CreateDuesSchema = z.object({
  scope: z.enum(['all', 'unit']),
  unitId: z.string().uuid().optional(),
  frequency: z.enum(['one_time', 'monthly', 'annual']),
  assessmentType: z.enum(['regular', 'special']).default('regular'),
  amount: z.number().positive().max(100_000),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  memo: z.string().max(140).optional(),
})

export interface CreateDuesInput {
  scope: 'all' | 'unit'
  unitId?: string
  frequency: 'one_time' | 'monthly' | 'annual'
  assessmentType?: 'regular' | 'special'
  amount: number
  firstDueDate: string  // YYYY-MM-DD
  memo?: string
}

/**
 * Manually add HOA dues. Two axes:
 *   • scope     = 'all' (every unit in the association) | 'unit' (one)
 *   • frequency = 'one_time' | 'monthly' (12 over 12 months) | 'annual'
 *
 * Each generated row gets a matching Dr AR / Cr Income journal entry
 * in the OPERATING fund — same accounting treatment as the
 * materialize flow.
 *
 * Sequential per-row (entry_number race). For "monthly × all units"
 * that's 49 × 12 = 588 round-trips and can take 30–60s. v1 takes the
 * straightforward path; if we hit Vercel timeouts we'll add batching.
 */
export async function createDues(
  input: CreateDuesInput,
): Promise<AssessmentActionResult> {
  const parsed = CreateDuesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  if (parsed.data.scope === 'unit' && !parsed.data.unitId) {
    return { ok: false, error: 'unitId is required when scope is "unit".' }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

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
    return { ok: false, error: 'No open fiscal period — run pnpm seed:accounting first.' }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) {
    return { ok: false, error: 'Accounting not set up — run pnpm seed:accounting.' }
  }

  // Resolve target units. For scope='all' pull every unit in the
  // association; for 'unit' grab the single one (validated to belong
  // to this association — defense against id-spoofing in the form).
  let units: Array<{ id: string; unit_number: string | null }> = []
  if (parsed.data.scope === 'all') {
    const { data } = await supabase
      .from('units')
      .select('id, unit_number')
      .eq('association_id', assoc.id)
    units = data ?? []
  } else {
    const { data } = await supabase
      .from('units')
      .select('id, unit_number')
      .eq('association_id', assoc.id)
      .eq('id', parsed.data.unitId!)
      .maybeSingle()
    if (!data) return { ok: false, error: 'Unit not found in this association.' }
    units = [data]
  }

  if (units.length === 0) {
    return { ok: false, error: 'No units to bill — import properties first.' }
  }

  // Build due dates from frequency.
  const dueDates = generateDueDates(parsed.data.firstDueDate, parsed.data.frequency)

  // Generate one assessment + JE per (unit × dueDate).
  let created = 0
  for (const u of units) {
    for (const due of dueDates) {
      const memoCode = memoCodeFor({
        associationSlug: assocRow.slug,
        unitNumber: u.unit_number,
        unitId: u.id,
        assessmentType: parsed.data.assessmentType,
      })

      const insertPayload: AssessmentInsert = {
        organization_id: assocRow.organization_id,
        association_id: assoc.id,
        unit_id: u.id,
        fiscal_period_id: period.id,
        assessment_type: parsed.data.assessmentType,
        amount: parsed.data.amount,
        due_date: due,
        memo_code: memoCode,
        status: 'open',
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('assessments')
        .insert(insertPayload)
        .select('id')
        .single()

      if (insertErr || !inserted) {
        return { ok: false, error: `unit ${u.id} @ ${due}: ${insertErr?.message ?? 'insert failed'}` }
      }

      const memoTxt = parsed.data.memo
        ? `${parsed.data.memo} (${parsed.data.assessmentType} dues, due ${due})`
        : `${parsed.data.assessmentType} dues, due ${due}`

      const je = await postJournalEntry(supabase, {
        organizationId: assocRow.organization_id,
        associationId: assoc.id,
        fiscalPeriodId: period.id,
        entryDate: new Date().toISOString().slice(0, 10),
        memo: memoTxt,
        source: 'ar_payment',
        sourceId: inserted.id,
        lines: [
          { accountId: refs.acctAR,                fundId: refs.fundOperating, debit: parsed.data.amount, credit: 0 },
          { accountId: refs.acctAssessmentIncome,  fundId: refs.fundOperating, debit: 0,                  credit: parsed.data.amount },
        ],
      })

      if (!je.ok) {
        // Roll back the orphan assessment so trial balance stays clean.
        await supabase.from('assessments').delete().eq('id', inserted.id)
        return { ok: false, error: `unit ${u.id} @ ${due} JE failed: ${je.error}` }
      }
      created += 1
    }
  }

  revalidatePath('/dues')
  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, created }
}

/**
 * Generates due dates from a first-due ISO date string and a frequency.
 *   - one_time / annual: [firstDueDate]   (single occurrence)
 *   - monthly: 12 dates, same day-of-month +0..+11 months from first
 *
 * Note: annual = one_time in v1. We split them in the type so the UI
 * can label "annual" distinctly, but the assessment shape is identical.
 * If you later want annual = 12 monthly payments of (amount / 12), do
 * that math in the caller before invoking this function.
 */
function generateDueDates(firstDue: string, frequency: 'one_time' | 'monthly' | 'annual'): string[] {
  if (frequency === 'one_time' || frequency === 'annual') return [firstDue]

  const first = new Date(`${firstDue}T00:00:00Z`)
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth() + i,
      first.getUTCDate(),
    ))
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Returns all units in the primary association, for the dropdown on /dues/new. */
export async function listUnitsForDues(): Promise<Array<{
  id: string
  label: string
}>> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return []

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('units')
    .select('id, address_line1, unit_number, lot_number')
    .eq('association_id', assoc.id)
    .order('address_line1', { ascending: true })

  return ((data ?? []) as Array<{
    id: string
    address_line1: string | null
    unit_number: string | null
    lot_number: string | null
  }>).map((u) => ({
    id: u.id,
    label: [
      u.lot_number ? `Lot ${u.lot_number}` : null,
      u.address_line1,
      u.unit_number ? `#${u.unit_number}` : null,
    ].filter(Boolean).join(' · '),
  }))
}

// ─── delete assessment ──────────────────────────────────────────────

export async function deleteAssessment(
  assessmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: assessment } = await supabase
    .from('assessments')
    .select('id, status')
    .eq('id', assessmentId)
    .eq('association_id', assoc.id)
    .single()
  if (!assessment) return { ok: false, error: 'Assessment not found.' }

  if (assessment.status === 'paid') {
    return { ok: false, error: 'Cannot delete a paid assessment. Reverse the payment first.' }
  }

  const { error } = await supabase
    .from('assessments')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', assessmentId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dues')
  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true }
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
  revalidatePath('/')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, assessmentId: assessment.id }
}
