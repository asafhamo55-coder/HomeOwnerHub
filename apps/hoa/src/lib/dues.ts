'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type DuesUpdate = Database['public']['Tables']['hoa_dues']['Update']

const PaidSchema = z.object({
  duesId: z.string().uuid(),
  amountPaid: z.number().min(0).optional(),
})

export type DuesActionResult = { ok: true } | { ok: false; error: string }

/** Marks a dues row paid. Optionally records exact amount paid. */
export async function markDuesPaid(input: {
  duesId: string
  amountPaid?: number
}): Promise<DuesActionResult> {
  const parsed = PaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const updates: DuesUpdate = {
    status: 'paid',
    paid_date: new Date().toISOString().slice(0, 10),
    ...(parsed.data.amountPaid !== undefined ? { amount_paid: parsed.data.amountPaid } : {}),
  }

  const { error } = await supabase
    .from('hoa_dues')
    .update(updates)
    .eq('id', parsed.data.duesId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dues')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Materialize a hoa_dues row for every property + this current period
 * if missing. The board manager hits this from /dues to bulk-create
 * the month's dues without a separate billing flow.
 */
export async function materializeCurrentPeriodDues(input: {
  amountPerProperty: number
  lateFeeRate?: number
}): Promise<DuesActionResult> {
  const Schema = z.object({
    amountPerProperty: z.number().min(0).max(100_000),
    lateFeeRate: z.number().min(0).max(50).optional(),
  })
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const today = new Date()
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const dueDate = `${period}-01`

  const { data: properties } = await supabase
    .from('hoa_properties')
    .select('id')
    .eq('org_id', org.id)

  const propertyIds = (properties ?? []).map((p) => p.id as string)
  if (propertyIds.length === 0) {
    return { ok: false, error: 'Add properties before generating dues.' }
  }

  const { data: existing } = await supabase
    .from('hoa_dues')
    .select('property_id')
    .eq('org_id', org.id)
    .eq('period', period)

  const alreadyHave = new Set(
    (existing ?? []).map((row) => row.property_id as string),
  )
  const toInsert = propertyIds.filter((id) => !alreadyHave.has(id))
  if (toInsert.length === 0) {
    return { ok: false, error: `Dues for ${period} are already on file.` }
  }

  const rows = toInsert.map((propertyId) => ({
    org_id: org.id,
    property_id: propertyId,
    period,
    due_date: dueDate,
    amount_due: parsed.data.amountPerProperty,
    status: 'pending',
  }))

  const { error } = await supabase.from('hoa_dues').insert(rows)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/dues')
  revalidatePath('/')
  return { ok: true }
}
