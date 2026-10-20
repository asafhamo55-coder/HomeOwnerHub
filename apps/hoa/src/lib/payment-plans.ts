'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { loadAccountingRefs } from '@homeowner-portal/db'
import { memoCodeFor } from '@homeowner-portal/workflows'
import {
  createPlanWithLedger,
  isPastDue,
  loadUnitPlanCharges,
  openCents,
  supabasePlanStore,
} from '@homeowner-portal/workflows/payment-plans'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getPrimaryAssociation } from '@/lib/vendors'
import { todayIn } from '@/lib/association-time'
import { readCurrentOpenPeriod } from '@homeowner-portal/jobs/fiscal-periods'
import { fieldErrorsOf } from '@/lib/field-errors'
import { chargeTypeLabel } from '@/lib/assessment-labels'

export type PaymentPlanResult =
  | { ok: true; planId: string; assessmentIds: string[]; replacedChargeIds: string[]; totalCents: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export interface PlanChargeOption {
  id: string
  label: string
  dueDate: string
  openCents: number
  /** Due before the association's today: preselected on the form. */
  pastDue: boolean
}

export type PlanChargesResult = { ok: true; charges: PlanChargeOption[] } | { ok: false; error: string }

const CreatePlanSchema = z.object({
  unitId: z.string().uuid(),
  chargeIds: z.array(z.string().uuid()).min(1, 'Pick at least one open charge for the plan to replace.').max(500),
  /** The total the board saw, in cents; refused if the open balance moved since. */
  expectedTotalCents: z.number().int().positive().max(100_000_000).optional(),
  installmentCount: z.number().int().min(2).max(60),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
})

async function planContext(unitId: string) {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false as const, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()
  const { data: assocRow } = await supabase.from('associations').select('organization_id, slug').eq('id', assoc.id).single()
  if (!assocRow) return { ok: false as const, error: 'Association not found.' }
  // Confirm the unit belongs to this association.
  const { data: unit } = await supabase.from('units').select('id, association_id, unit_number').eq('id', unitId).single()
  if (!unit || unit.association_id !== assoc.id) return { ok: false as const, error: 'Unit not found in this association.' }
  return { ok: true as const, assoc, assocRow, unit, supabase, today: todayIn(assoc.timeZone) }
}

/**
 * The open charges on a property that a new plan can replace, oldest
 * first. The form preselects the past-due ones.
 */
export async function listPlanCharges(unitId: string): Promise<PlanChargesResult> {
  if (!z.string().uuid().safeParse(unitId).success) return { ok: false, error: 'Pick a property.' }
  const c = await planContext(unitId)
  if (!c.ok) return c
  try {
    const all = await loadUnitPlanCharges(c.supabase, c.assoc.id, unitId)
    return {
      ok: true,
      charges: all
        .filter((x) => openCents(x) > 0)
        .map((x) => ({
          id: x.id,
          label: chargeTypeLabel(x.assessmentType),
          dueDate: x.dueDate,
          openCents: openCents(x),
          pastDue: isPastDue(x, c.today),
        })),
    }
  } catch {
    return { ok: false, error: 'Couldn’t load the charges on this property. Try again.' }
  }
}

/**
 * Create a payment plan that REPLACES the open charges the board picked
 * (2026-10-19 fix for the BL-080 double count). The plan total is what is
 * still open on those charges. In one operation the replaced charges are
 * closed (Dr Income / Cr AR, status 'waived', linked to the plan by the
 * entry's memo) and one charge per installment is billed (Dr AR /
 * Cr Assessment Income), so the owner's balance, AR and income do not
 * change when a plan is made. Installments are due monthly from the start
 * date, clamped at month ends. See packages/workflows/src/payment-plans/
 * ledger.ts and create.ts.
 */
export async function createPaymentPlan(input: {
  unitId: string
  chargeIds: string[]
  expectedTotalCents?: number
  installmentCount: number
  startDate: string
}): Promise<PaymentPlanResult> {
  const parsed = CreatePlanSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'invalid input',
      fieldErrors: fieldErrorsOf(parsed.error),
    }
  }
  const value = parsed.data

  const c = await planContext(value.unitId)
  if (!c.ok) return c

  // The open period that has STARTED, on the association's day (BL-076):
  // next year, opened early, waits for its first day.
  const { data: period } = await readCurrentOpenPeriod(c.supabase, c.assoc.id, c.today)
  if (!period) return { ok: false, error: 'No open fiscal period.' }

  const refs = await loadAccountingRefs(c.supabase, c.assoc.id)
  if (!refs) return { ok: false, error: 'Accounting not set up.' }

  const store = supabasePlanStore(c.supabase, {
    organizationId: c.assocRow.organization_id,
    associationId: c.assoc.id,
    fiscalPeriodId: period.id,
    entryDate: c.today, // the association's day (BL-043)
    installmentMemoCode: memoCodeFor({
      associationSlug: c.assocRow.slug,
      unitNumber: c.unit.unit_number,
      unitId: c.unit.id,
      assessmentType: 'special',
    }),
  })

  let outcome
  try {
    outcome = await createPlanWithLedger(store, refs, value)
  } catch {
    return { ok: false, error: 'Couldn’t create the plan. Nothing was saved. Try again in a minute.' }
  }
  if (!outcome.ok) return { ok: false, error: outcome.error }

  revalidatePath('/') // dashboard rollup
  revalidatePath('/accounting/payment-plans')
  revalidatePath('/dues')
  revalidatePath('/accounting/ledger')
  return {
    ok: true,
    planId: outcome.planId,
    assessmentIds: outcome.installmentIds,
    replacedChargeIds: outcome.replacedChargeIds,
    totalCents: outcome.totalCents,
  }
}
