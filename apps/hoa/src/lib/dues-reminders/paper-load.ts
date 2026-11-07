import type { SupabaseClient } from '@supabase/supabase-js'
import { readAll } from '@/lib/supabase/read-all'
import { unitPropertyIndex } from '@/lib/properties/resolve'
import { chargeFromAssessment, sortCharges, type ChargeSource } from './packets'
import type { ReminderCharge } from './types'

interface Row extends ChargeSource {
  unit_id: string
}

/**
 * Every open charge in the organization, grouped by home (property). The
 * same open/partial, not-deleted rule and the same balance math as the
 * emailed reminder. Read to the end with readAll and scoped to the org; a
 * failed page throws, so the page can show a load failure instead of a
 * quietly short list. Nothing is logged here, and error text carries only a
 * table name and code.
 */
export async function loadOpenChargesByProperty(
  supabase: SupabaseClient,
  orgId: string,
  today: string,
): Promise<Map<string, ReminderCharge[]>> {
  const rows = await readAll<Row>(
    (from, to) =>
      supabase
        .from('assessments')
        .select('id, unit_id, amount, due_date, assessment_type, payments(amount)')
        .eq('organization_id', orgId)
        .in('status', ['open', 'partial'])
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { code?: string; message?: string } | null }>,
    (e) => new Error(`paper reminders: assessments read failed (${e.code ?? 'no code'})`),
  )
  const unitToProperty = await unitPropertyIndex(supabase as never, orgId)
  const out = new Map<string, ReminderCharge[]>()
  for (const r of rows) {
    const propertyId = unitToProperty.get(r.unit_id as never) as string | undefined
    if (!propertyId) continue
    const charge = chargeFromAssessment(r, today)
    if (!charge) continue
    const list = out.get(propertyId) ?? []
    list.push(charge)
    out.set(propertyId, list)
  }
  for (const list of out.values()) sortCharges(list)
  return out
}
