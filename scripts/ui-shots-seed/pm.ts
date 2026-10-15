import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for the PM Hub shots: one occupied rental whose lease began
 * eight months ago, every past month paid (one late, with a fee), and the
 * current month unpaid — so the dashboard shows the overdue / "Start
 * eviction" path. Idempotent; invented data only (reserved-TLD email,
 * "Sample" street).
 */
export async function seed_pm(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const { data: existing, error: selErr } = await db
    .from('pm_properties')
    .select('id')
    .eq('org_id', ctx.pmOrgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (selErr) throw new Error(`pm_properties select: ${selErr.code}`)

  const today = new Date()
  const leaseStart = new Date(today.getFullYear(), today.getMonth() - 8, 1)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  let propertyId = existing?.id as string | undefined
  if (!propertyId) {
    const { data, error } = await db
      .from('pm_properties')
      .insert({
        org_id: ctx.pmOrgId,
        address: '48 Sample Way, Unit B, Houston, TX 77002',
        monthly_rent: 1850,
        deposit: 1850,
        bedrooms: 2,
        bathrooms: 1.5,
        sq_ft: 1040,
        tenant_name: 'Sample Tenant',
        tenant_email: 'tenant@example.test',
        tenant_phone: '(555) 010-0148',
        lease_start: iso(leaseStart),
        lease_end: iso(new Date(leaseStart.getFullYear() + 1, leaseStart.getMonth(), 0)),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`pm_properties insert: ${error?.code}`)
    propertyId = data.id as string
  }

  // Ledger: one row per month since lease start; all but the current month paid.
  const { data: rows } = await db.from('pm_rent_ledger').select('period').eq('property_id', propertyId)
  const have = new Set((rows ?? []).map((r) => r.period as string))
  const inserts: Record<string, unknown>[] = []
  for (let i = 8; i >= 0; i--) {
    const due = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const period = iso(due).slice(0, 7)
    if (have.has(period)) continue
    const paid = i > 0
    const late = i === 3
    inserts.push({
      org_id: ctx.pmOrgId,
      property_id: propertyId,
      period,
      due_date: iso(due),
      amount_due: 1850,
      amount_paid: paid ? (late ? 1942.5 : 1850) : 0,
      late_fee: late ? 92.5 : 0,
      late_fee_rate: 5,
      status: paid ? 'paid' : 'pending',
      paid_date: paid ? iso(new Date(due.getFullYear(), due.getMonth(), late ? 7 : 1)) : null,
    })
  }
  if (inserts.length) {
    const { error } = await db.from('pm_rent_ledger').insert(inserts)
    if (error) throw new Error(`pm_rent_ledger insert: ${error.code}`)
  }
  console.log(`seed pm: property ${propertyId.slice(0, 8)}…, ${inserts.length} ledger rows added`)
  return { pmPropertyId: propertyId }
}
