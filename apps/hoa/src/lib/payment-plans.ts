'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { loadAccountingRefs, postJournalEntry } from '@homeowner-portal/db'
import { memoCodeFor } from '@homeowner-portal/workflows'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

type PaymentPlanInsert = Database['public']['Tables']['payment_plans']['Insert']
type AssessmentInsert = Database['public']['Tables']['assessments']['Insert']

export type PaymentPlanResult =
  | { ok: true; planId: string; assessmentIds: string[] }
  | { ok: false; error: string }

const CreatePlanSchema = z.object({
  unitId: z.string().uuid(),
  totalAmount: z.number().positive().max(1_000_000),
  installmentCount: z.number().int().min(2).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
})

/**
 * Create a payment plan + generate one assessment per installment.
 * Each assessment posts its own Dr AR / Cr Assessment Income JE so the
 * obligation hits the ledger immediately — payments against the plan
 * close out each installment one by one.
 *
 * Installments are scheduled monthly from startDate. installment_amount
 * is total / count, rounded to cents; any rounding drift goes to the
 * last installment so the plan totals exactly match.
 */
export async function createPaymentPlan(input: {
  unitId: string
  totalAmount: number
  installmentCount: number
  startDate: string
}): Promise<PaymentPlanResult> {
  const parsed = CreatePlanSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id, slug')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  // Confirm unit belongs to this association.
  const { data: unit } = await supabase
    .from('units')
    .select('id, association_id, unit_number')
    .eq('id', value.unitId)
    .single()
  if (!unit || unit.association_id !== assoc.id) {
    return { ok: false, error: 'Unit not found in this association.' }
  }

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) return { ok: false, error: 'No open fiscal period.' }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) return { ok: false, error: 'Accounting not set up.' }

  const installmentAmountRaw = value.totalAmount / value.installmentCount
  const installmentAmount = Math.round(installmentAmountRaw * 100) / 100
  // Drift goes to the final installment so total reconciles exactly.
  const driftAdj =
    Math.round(
      (value.totalAmount - installmentAmount * value.installmentCount) * 100,
    ) / 100

  const planPayload: PaymentPlanInsert = {
    organization_id: assocRow.organization_id,
    unit_id: value.unitId,
    total_amount: value.totalAmount,
    installment_count: value.installmentCount,
    installment_amount: installmentAmount,
    start_date: value.startDate,
    status: 'active',
  }
  const { data: plan, error: planErr } = await supabase
    .from('payment_plans')
    .insert(planPayload)
    .select('id')
    .single()
  if (planErr || !plan) return { ok: false, error: `plan insert: ${planErr?.message}` }

  // Generate installments. We use 'special' as the assessment_type per
  // the CHECK constraint (regular/special/late_fee/fine — special fits
  // "promised payment from a plan" cleanly).
  const assessmentIds: string[] = []
  const [y, m, d] = value.startDate.split('-').map(Number)

  for (let i = 0; i < value.installmentCount; i++) {
    const dueDate = new Date(Date.UTC(y, m - 1 + i, d))
      .toISOString()
      .slice(0, 10)
    const isLast = i === value.installmentCount - 1
    const amount = isLast ? installmentAmount + driftAdj : installmentAmount

    const memoCode = memoCodeFor({
      associationSlug: assocRow.slug,
      unitNumber: unit.unit_number,
      unitId: unit.id,
      assessmentType: 'special',
    })

    const assessmentPayload: AssessmentInsert = {
      organization_id: assocRow.organization_id,
      association_id: assoc.id,
      unit_id: value.unitId,
      fiscal_period_id: period.id,
      assessment_type: 'special',
      amount,
      due_date: dueDate,
      memo_code: memoCode,
      status: 'open',
    }
    const { data: assess, error: aErr } = await supabase
      .from('assessments')
      .insert(assessmentPayload)
      .select('id')
      .single()
    if (aErr || !assess) {
      // Roll back the plan + every assessment we made so far so the user
      // isn't left with a partial state.
      await supabase
        .from('assessments')
        .delete()
        .in('id', assessmentIds.length > 0 ? assessmentIds : ['00000000-0000-0000-0000-000000000000'])
      await supabase.from('payment_plans').delete().eq('id', plan.id)
      return { ok: false, error: `installment ${i + 1}: ${aErr?.message}` }
    }
    assessmentIds.push(assess.id)

    const je = await postJournalEntry(supabase, {
      organizationId: assocRow.organization_id,
      associationId: assoc.id,
      fiscalPeriodId: period.id,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Payment plan installment ${i + 1}/${value.installmentCount} (plan ${plan.id.slice(0, 8)})`,
      source: 'ar_payment',
      sourceId: assess.id,
      lines: [
        { accountId: refs.acctAR, fundId: refs.fundOperating, debit: amount, credit: 0 },
        { accountId: refs.acctAssessmentIncome, fundId: refs.fundOperating, debit: 0, credit: amount },
      ],
    })
    if (!je.ok) {
      await supabase.from('assessments').delete().in('id', assessmentIds)
      await supabase.from('payment_plans').delete().eq('id', plan.id)
      return { ok: false, error: `installment ${i + 1} JE failed: ${je.error}` }
    }
  }

  revalidatePath('/accounting/payment-plans')
  revalidatePath('/dues')
  revalidatePath('/accounting/ledger')
  return { ok: true, planId: plan.id, assessmentIds }
}
