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

// Materialize rent ledger rows for every month from lease_start to today
// (or just the current month if lease_start isn't set). Idempotent —
// existing rows are preserved, only missing periods get inserted.
//
// Called from the dashboard + /rent on every page load so the ledger
// always reflects the property's current lease window. If you backdate
// the lease, the prior months auto-fill on next visit.
//
// Replaces the older ensureCurrentPeriodLedger which only materialized
// the current month.
export async function ensureLeaseLedger(propertyId: string): Promise<void> {
  const org = await getCurrentOrg()
  if (!org) return

  const supabase = await getSupabaseServerClient()

  const { data: prop } = await supabase
    .from('pm_properties')
    .select('monthly_rent, lease_start')
    .eq('id', propertyId)
    .maybeSingle()

  const rent = (prop?.monthly_rent as number | null) ?? 0
  if (rent <= 0) return

  const leaseStartStr = (prop?.lease_start as string | null) ?? null

  const today = new Date()
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const startMonth = leaseStartStr
    ? new Date(
        new Date(leaseStartStr).getFullYear(),
        new Date(leaseStartStr).getMonth(),
        1,
      )
    : currentMonthStart

  // Defensive cap so a typo'd 1990 lease_start doesn't materialize 400 rows.
  // Phase 1: backfill at most 24 months prior to today.
  const earliestAllowed = new Date(
    today.getFullYear(),
    today.getMonth() - 24,
    1,
  )
  const effectiveStart =
    startMonth < earliestAllowed ? earliestAllowed : startMonth

  const months: Array<{ period: string; due_date: string }> = []
  const cursor = new Date(effectiveStart)
  while (cursor <= currentMonthStart) {
    const yyyy = cursor.getFullYear()
    const mm = String(cursor.getMonth() + 1).padStart(2, '0')
    months.push({ period: `${yyyy}-${mm}`, due_date: `${yyyy}-${mm}-01` })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  if (months.length === 0) return

  const { data: existing } = await supabase
    .from('pm_rent_ledger')
    .select('period')
    .eq('property_id', propertyId)
    .in(
      'period',
      months.map((m) => m.period),
    )

  const existingPeriods = new Set(
    (existing ?? []).map((r) => r.period as string),
  )

  const toInsert = months
    .filter((m) => !existingPeriods.has(m.period))
    .map((m) => ({
      org_id: org.id,
      property_id: propertyId,
      period: m.period,
      due_date: m.due_date,
      amount_due: rent,
      status: 'pending',
      late_fee_rate: 5, // 5% default; configurable per-row later.
    }))

  if (toInsert.length === 0) return
  await supabase.from('pm_rent_ledger').insert(toInsert)
}

/**
 * @deprecated Use ensureLeaseLedger instead — it backfills past months
 * from lease_start, not just the current period.
 */
export const ensureCurrentPeriodLedger = ensureLeaseLedger
