'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeownerhub/db/types'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type RentLedgerUpdate = Database['public']['Tables']['pm_rent_ledger']['Update']

const PaidSchema = z.object({
  ledgerId: z.string().uuid(),
  amountPaid: z.number().min(0).optional(),
  paidDate: z.string().optional(),
})

export type RentActionResult = { ok: true } | { ok: false; error: string }

export async function markPeriodPaid(input: {
  ledgerId: string
  amountPaid?: number
  paidDate?: string
}): Promise<RentActionResult> {
  const parsed = PaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const updates: RentLedgerUpdate = {
    status: 'paid',
    paid_date: parsed.data.paidDate ?? new Date().toISOString().slice(0, 10),
    ...(parsed.data.amountPaid !== undefined ? { amount_paid: parsed.data.amountPaid } : {}),
  }

  const { error } = await supabase
    .from('pm_rent_ledger')
    .update(updates)
    .eq('id', parsed.data.ledgerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/rent')
  return { ok: true }
}

// Materialize a rent ledger row for the current period if one doesn't already
// exist. Called when the user lands on the dashboard so they always see this
// month's status without manual setup.
export async function ensureCurrentPeriodLedger(propertyId: string): Promise<void> {
  const org = await getCurrentOrg()
  if (!org) return

  const supabase = await getSupabaseServerClient()
  const today = new Date()
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const dueDate = `${period}-01`

  const { data: existing } = await supabase
    .from('pm_rent_ledger')
    .select('id')
    .eq('property_id', propertyId)
    .eq('period', period)
    .maybeSingle()

  if (existing) return

  const { data: prop } = await supabase
    .from('pm_properties')
    .select('monthly_rent')
    .eq('id', propertyId)
    .maybeSingle()

  const rent = (prop?.monthly_rent as number | null) ?? 0
  if (rent <= 0) return

  await supabase.from('pm_rent_ledger').insert({
    org_id: org.id,
    property_id: propertyId,
    period,
    due_date: dueDate,
    amount_due: rent,
    status: 'pending',
    late_fee_rate: 5, // 5% — typical default; configurable later.
  })
}
