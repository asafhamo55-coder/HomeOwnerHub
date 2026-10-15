import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for the Eviction Hub shots: one case per pipeline column plus
 * one unfinished intake draft. Idempotent (keyed on address within the demo
 * org); invented data only (reserved-TLD emails, "Demo/Sample" streets).
 * Returns `evictionCaseId` — the notice-sent case whose cure clock is still
 * running — for the case-detail shot.
 */
const NOTICE = `NOTICE TO VACATE

To: Demo Tenant A
Premises: 12 Demo Court, Houston, TX 77002

You are hereby notified that rent for the premises is past due. Under Texas Property Code § 24.005, you must vacate the premises within three (3) days of delivery of this notice.

If you do not vacate by that date, the landlord may file a forcible-detainer suit in the Justice of the Peace court.

Landlord: Demo Rentals LLC`

export async function seed_eviction(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const day = 86_400_000
  const now = Date.now()
  const date = (offsetDays: number) => new Date(now + offsetDays * day).toISOString().slice(0, 10)
  const ts = (offsetDays: number) => new Date(now + offsetDays * day).toISOString()

  const cases: Array<Record<string, unknown> & { key: string; property_address: string }> = [
    {
      key: 'running',
      property_address: '12 Demo Court, Houston, TX 77002',
      tenant_name: 'Demo Tenant A',
      tenant_email: 'tenant-a@example.test',
      monthly_rent: 1650,
      days_unpaid: 9,
      status: 'notice_sent',
      notice_type: '3day_pay_or_quit',
      notice_draft: NOTICE,
      notice_approved: true,
      notice_sent_at: ts(-1),
      notice_served_method: 'personal',
      filing_eligible_date: date(2),
      case_notes: 'Tenant said a paycheck is delayed; partial payment offered by text.',
      compliance_flags: {
        flags: ['Partial payment offered — accepting it may waive the notice under the lease terms.'],
        recommendation: 'Do not accept partial payment until the cure period ends, or re-serve notice after accepting.',
      },
      created_at: ts(-2),
    },
    {
      key: 'ready',
      property_address: '7 Sample Way, Apt 3, Houston, TX 77004',
      tenant_name: 'Demo Tenant B',
      tenant_email: 'tenant-b@example.test',
      monthly_rent: 1400,
      days_unpaid: 21,
      status: 'notice_sent',
      notice_type: '3day_pay_or_quit',
      notice_draft: NOTICE.replace('Demo Tenant A', 'Demo Tenant B').replace('12 Demo Court', '7 Sample Way, Apt 3'),
      notice_approved: true,
      notice_sent_at: ts(-6),
      notice_served_method: 'posting',
      filing_eligible_date: date(-3),
      created_at: ts(-7),
    },
    {
      key: 'intake',
      property_address: '305 Mock Lane, Houston, TX 77008',
      tenant_name: 'Demo Tenant C',
      monthly_rent: 2100,
      days_unpaid: 4,
      status: 'intake',
      created_at: ts(-1),
    },
    {
      key: 'filed',
      property_address: '19 Demo Court, Houston, TX 77002',
      tenant_name: 'Demo Tenant D',
      monthly_rent: 1550,
      days_unpaid: 38,
      status: 'filed',
      notice_type: '3day_pay_or_quit',
      notice_approved: true,
      notice_sent_at: ts(-20),
      notice_served_method: 'certified_mail',
      filing_eligible_date: date(-17),
      court_case_number: 'DEMO-JP-0001',
      hearing_date: date(9),
      created_at: ts(-21),
    },
    {
      key: 'resolved',
      property_address: '2 Sample Way, Houston, TX 77004',
      tenant_name: 'Demo Tenant E',
      monthly_rent: 1300,
      days_unpaid: 45,
      status: 'resolved',
      notice_type: '3day_pay_or_quit',
      notice_approved: true,
      notice_sent_at: ts(-60),
      notice_served_method: 'personal',
      filing_eligible_date: date(-57),
      outcome: 'Settled — tenant paid in full',
      created_at: ts(-61),
    },
  ]

  const { data: existing, error } = await db
    .from('eviction_cases')
    .select('id, property_address')
    .eq('org_id', ctx.evictionOrgId)
  if (error) throw new Error(`eviction_cases select: ${error.code}`)
  const byAddress = new Map((existing ?? []).map((r) => [r.property_address as string, r.id as string]))

  let added = 0
  let runningId: string | undefined
  for (const { key, ...row } of cases) {
    let id = byAddress.get(row.property_address)
    if (!id) {
      const { data, error: insErr } = await db
        .from('eviction_cases')
        .insert({ ...row, org_id: ctx.evictionOrgId, user_id: ctx.userId, county: 'harris_tx', state: 'TX' })
        .select('id')
        .single()
      if (insErr || !data) throw new Error(`eviction_cases insert: ${insErr?.code}`)
      id = data.id as string
      added++
    }
    if (key === 'running') runningId = id
  }

  // One unfinished intake draft for the "Unfinished workflows" card.
  const { data: drafts } = await db
    .from('wizard_drafts')
    .select('id')
    .eq('org_id', ctx.evictionOrgId)
    .eq('kind', 'eviction_case')
    .eq('completed', false)
    .limit(1)
  if (!drafts?.length) {
    await db.from('wizard_drafts').insert({
      org_id: ctx.evictionOrgId,
      user_id: ctx.userId,
      kind: 'eviction_case',
      payload: { propertyAddress: '88 Mock Lane, Houston, TX 77008', tenantName: 'Demo Tenant F', monthlyRent: 1750, daysUnpaid: 6 },
      current_step: 'compliance',
      step_index: 1,
      total_steps: 4,
      updated_at: ts(-0.2),
    })
  }

  console.log(`seed eviction: ${cases.length} cases (${added} added)`)
  return runningId ? { evictionCaseId: runningId } : {}
}
