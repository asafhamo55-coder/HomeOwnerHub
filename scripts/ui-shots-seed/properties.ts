import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for the properties shots (P1 quick wins): house numbers that
 * only sort right numerically (13, 128, 1200 Demo Court), one home missing
 * its owner and one missing its tenure (the named "No owner" / "No tenure"
 * pills), and a detail home — "128 Demo Court" — with an owner phone and
 * email, a resident, a bridged unit with an open charge, an open ARC
 * application, and violations past cure, inside cure and closed, so the
 * Violations tab's "Cure by" column and urgency order are exercised.
 *
 * Idempotent (find-or-create); invented data only: 555-01xx numbers and
 * reserved-TLD emails.
 */
const DAY = 86_400_000

export async function seed_properties(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  const homes: Array<{ address: string; rest: Record<string, unknown> }> = [
    { address: '13 Demo Court', rest: { owner_name: 'Sam Sample', tenure: 'leased' } },
    { address: '1200 Demo Court', rest: { owner_name: 'Alex Placeholder', tenure: 'owner_occupied' } },
    { address: '45 Demo Court', rest: { tenure: 'owner_occupied' } }, // no owner
    { address: '9 Mock Lane', rest: { owner_name: 'Jordan Example', tenure: 'unknown' } }, // no tenure
  ]
  for (const h of homes) await findOrCreate(db, 'hoa_properties', { org_id: org, address: h.address }, h.rest)

  const propertyId = await findOrCreate(
    db,
    'hoa_properties',
    { org_id: org, address: '128 Demo Court' },
    {
      owner_name: 'Pat Example',
      owner_email: 'pat.example@ui-shots.example.test',
      owner_phone: '(555) 010-0128',
      tenure: 'owner_occupied',
      notes: 'Gate code on file with the management office.',
    },
  )

  await findOrCreate(
    db,
    'property_residents',
    { property_id: propertyId, full_name: 'Robin Example' },
    {
      organization_id: org,
      role: 'family_member',
      email: 'robin.example@ui-shots.example.test',
      phone: '(555) 010-0129',
      is_primary: false,
      moved_in_at: '2024-03-01',
    },
  )
  await findOrCreate(
    db,
    'property_residents',
    { property_id: propertyId, full_name: 'Pat Example' },
    { organization_id: org, role: 'owner', email: 'pat.example@ui-shots.example.test', phone: '(555) 010-0128', is_primary: true },
  )

  // Violations: past cure, inside cure, no notice yet, closed.
  const violations = [
    { key: 'ui-shots: trash cans visible from street', notice: 30, cure: 14, status: 'notice_sent' },
    { key: 'ui-shots: mailbox post leaning', notice: 3, cure: 21, status: 'notice_sent' },
    { key: 'ui-shots: lawn not mowed', notice: null, cure: 14, status: 'open' },
    { key: 'ui-shots: unapproved shed (closed)', notice: 90, cure: 30, status: 'resolved' },
  ] as const
  for (const v of violations) {
    await findOrCreate(
      db,
      'hoa_violations',
      { org_id: org, description: v.key },
      {
        property_id: propertyId,
        violation_type: 'Maintenance',
        status: v.status,
        severity: 'low',
        notice_sent_at: v.notice === null ? null : iso(now - v.notice * DAY),
        cure_period_days: v.cure,
        created_at: iso(now - ((v.notice ?? 1) + 2) * DAY),
      },
    )
  }

  // A bridged unit (so Dues, Mail and ARC have somewhere to hang), in the
  // demo association, with one open charge and one open ARC application.
  const { data: assocUnits } = await db
    .from('units')
    .select('association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .limit(1)
  const assoc = (assocUnits?.[0] as { association_id: string } | undefined)?.association_id
  if (assoc) {
    const unitId = await findOrCreate(
      db,
      'units',
      { organization_id: org, legacy_hoa_property_id: propertyId },
      { association_id: assoc, address_line1: '128 Demo Court' },
    )
    const { data: fp } = await db
      .from('fiscal_periods')
      .select('id')
      .eq('association_id', assoc)
      .order('start_date', { ascending: false })
      .limit(1)
    const periodId = (fp?.[0] as { id: string } | undefined)?.id
    if (periodId) {
      await findOrCreate(
        db,
        'assessments',
        { unit_id: unitId, due_date: iso(now - 40 * DAY).slice(0, 10), assessment_type: 'regular' },
        { organization_id: org, association_id: assoc, fiscal_period_id: periodId, amount: 325, status: 'open' },
      )
    }
    await findOrCreate(
      db,
      'arc_requests',
      { unit_id: unitId, summary: 'ui-shots: replace back fence' },
      {
        organization_id: org,
        association_id: assoc,
        submitted_by: ctx.userId,
        category: 'fence',
        scope_description: 'Replace the back fence with a 6 ft cedar fence on the existing line.',
        status: 'submitted',
      },
    )
  }

  console.log('seed properties: ok')
  return { propertyId }
}

async function findOrCreate(
  db: SupabaseClient,
  table: string,
  match: Record<string, string>,
  rest: Record<string, unknown>,
): Promise<string> {
  let q = db.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data } = await q.limit(1)
  const found = (data?.[0] as { id: string } | undefined)?.id
  if (found) return found
  const { data: row, error } = await db.from(table).insert({ ...match, ...rest }).select('id').single()
  if (error || !row) throw new Error(`${table} insert: ${error?.code}`)
  return (row as { id: string }).id
}
