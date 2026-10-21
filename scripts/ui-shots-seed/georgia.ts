import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'
import { extraOrg } from './setup'

/**
 * A Georgia demo association (next.md §2: Georgia is the launch state; the
 * main demo org is a Florida one). Its own HOA org, reached with the
 * active-org cookie (`org: 'gaHoaOrgId'`), with:
 *  - associations.state and governing_law_state both 'GA';
 *  - a handful of homes, each bridged to a unit in the association;
 *  - an owner with a balance (open charges on 14 Peach Demo Lane), so the
 *    estoppel route renders Georgia's § 44-3-232(d) statement of amounts due;
 *  - one open violation on the same home;
 *  - the SB 406 registration deadline (2027-01-01) left NOT done: any
 *    acknowledgment or compliance_deadlines_done row a previous run's
 *    click-through left is removed, so the dashboard card always shows.
 *
 * No Georgia statute rows: CI's schema replay (tests/integration/schema/
 * manifest.ts SCHEMA_SEEDS) does not load migrations/seed-state-law-ga.sql,
 * so there is no /legal shot for this org.
 *
 * CI-only throwaway Supabase. Idempotent (find-or-create); fail-soft per
 * part, so one failed part still returns the vars the others produced.
 * Invented data only: "Demo" street names, reserved-TLD emails.
 */
const GA_NAME = 'Peach Demo Commons HOA'
const DAY = 86_400_000
const SB406_CODE = 'ga-sos-registration-2027'

export async function seed_georgia(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const vars: Record<string, string> = {}
  const part = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      console.log(`seed georgia ${name}: failed — ${(e as Error).message}`)
    }
  }
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  const gaHoaOrgId = await extraOrg(db, ctx, GA_NAME, 'admin')
  vars.gaHoaOrgId = gaHoaOrgId
  const org = gaHoaOrgId

  // Association: Georgia by address and by governing law.
  let assocId: string | null = null
  await part('association', async () => {
    const { data: existing, error: findErr } = await db.from('associations').select('id').eq('organization_id', org).limit(1)
    if (findErr) throw new Error(`association find: ${findErr.code}`)
    assocId = (existing?.[0] as { id?: string } | undefined)?.id ?? null
    if (assocId) {
      const { error } = await db.from('associations').update({ state: 'GA', governing_law_state: 'GA' }).eq('id', assocId)
      if (error) throw new Error(`association update: ${error.code}`)
      return
    }
    const { data, error } = await db
      .from('associations')
      .insert({ organization_id: org, name: GA_NAME, state: 'GA', governing_law_state: 'GA', type: 'hoa', slug: 'PEACHDEMO' })
      .select('id')
      .single()
    if (error || !data) throw new Error(`association insert: ${error?.code}`)
    assocId = data.id as string
  })
  if (!assocId) return vars
  const association = assocId as string

  // SB 406 deadline: not done. Drop any signed acknowledgment (keeping the
  // other compliance_settings keys) and any done row.
  await part('sb406 reset', async () => {
    const { data, error } = await db.from('associations').select('compliance_settings').eq('id', association).single()
    if (error) throw new Error(`compliance_settings read: ${error.code}`)
    const settings = { ...(((data as { compliance_settings?: unknown })?.compliance_settings as Record<string, unknown> | null) ?? {}) }
    const acks = { ...((settings.compliance_deadline_acks as Record<string, unknown> | undefined) ?? {}) }
    if (SB406_CODE in acks) {
      delete acks[SB406_CODE]
      settings.compliance_deadline_acks = acks
      const { error: uErr } = await db.from('associations').update({ compliance_settings: settings }).eq('id', association)
      if (uErr) throw new Error(`compliance_settings update: ${uErr.code}`)
    }
    const { error: dErr } = await db.from('compliance_deadlines_done').delete().eq('association_id', association).eq('code', SB406_CODE)
    if (dErr) throw new Error(`compliance_deadlines_done reset: ${dErr.code}`)
  })

  // Homes, each bridged to a unit in the association.
  const homes: Array<{ address: string; rest: Record<string, unknown> }> = [
    {
      address: '14 Peach Demo Lane',
      rest: {
        owner_name: 'Casey Sample',
        owner_email: 'casey.sample@ui-shots.example.test',
        owner_phone: '(555) 010-0414',
        tenure: 'owner_occupied',
      },
    },
    { address: '16 Peach Demo Lane', rest: { owner_name: 'Morgan Example', tenure: 'owner_occupied' } },
    { address: '18 Peach Demo Lane', rest: { owner_name: 'Taylor Placeholder', tenure: 'leased' } },
    { address: '3 Magnolia Mock Court', rest: { owner_name: 'Riley Demo', tenure: 'owner_occupied' } },
    { address: '5 Magnolia Mock Court', rest: { owner_name: 'Jamie Sample', tenure: 'unknown' } },
  ]
  const unitByAddress = new Map<string, string>()
  await part('homes', async () => {
    for (const h of homes) {
      const propertyId = await findOrCreate(db, 'hoa_properties', { org_id: org, address: h.address }, h.rest)
      if (h.address === homes[0]!.address) vars.gaPropertyId = propertyId
      const unitId = await findOrCreate(
        db,
        'units',
        { organization_id: org, legacy_hoa_property_id: propertyId },
        { association_id: association, address_line1: h.address },
      )
      unitByAddress.set(h.address, unitId)
    }
  })
  const propertyId = vars.gaPropertyId
  if (!propertyId) return vars

  await part('owner', async () => {
    await findOrCreate(
      db,
      'property_residents',
      { property_id: propertyId, full_name: 'Casey Sample' },
      { organization_id: org, role: 'owner', email: 'casey.sample@ui-shots.example.test', phone: '(555) 010-0414', is_primary: true },
    )
  })

  // The owner's balance: two quarterly charges past due and unpaid.
  await part('balance', async () => {
    const unitId = unitByAddress.get(homes[0]!.address)
    if (!unitId) throw new Error('no unit for the balance home')
    const periodId = await findOrCreate(
      db,
      'fiscal_periods',
      { organization_id: org, association_id: association, start_date: '2026-01-01' },
      { end_date: '2026-12-31', status: 'open' },
    )
    const charges = [
      { due: '2026-07-01', amount: 450 },
      { due: '2026-10-01', amount: 450 },
    ]
    for (const c of charges) {
      await findOrCreate(
        db,
        'assessments',
        { unit_id: unitId, due_date: c.due, assessment_type: 'regular' },
        { organization_id: org, association_id: association, fiscal_period_id: periodId, amount: c.amount, status: 'open' },
      )
    }
  })

  await part('violation', async () => {
    vars.gaViolationId = await findOrCreate(
      db,
      'hoa_violations',
      { org_id: org, description: 'ui-shots: GA boat trailer parked in driveway' },
      {
        property_id: propertyId,
        violation_type: 'Parking',
        status: 'notice_sent',
        severity: 'medium',
        notice_sent_at: iso(now - 6 * DAY),
        cure_period_days: 14,
        created_at: iso(now - 8 * DAY),
      },
    )
  })

  console.log('seed georgia: ok')
  return vars
}

async function findOrCreate(
  db: SupabaseClient,
  table: string,
  match: Record<string, string>,
  rest: Record<string, unknown>,
): Promise<string> {
  let q = db.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error: findErr } = await q.limit(1)
  if (findErr) throw new Error(`${table} find: ${findErr.code}`)
  const found = (data?.[0] as { id: string } | undefined)?.id
  if (found) return found
  const { data: row, error } = await db.from(table).insert({ ...match, ...rest }).select('id').single()
  if (error || !row) throw new Error(`${table} insert: ${error?.code}`)
  return (row as { id: string }).id
}
