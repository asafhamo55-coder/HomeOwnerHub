import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows the user-guide screenshots need (BL-070, scripts/guide-shots.ts)
 * beyond what the other seeders create: a freshly submitted ARC
 * application (the board's "Needs decision" list) and one sent
 * announcement with delivery rows (the Communications list and history).
 * Idempotent; invented data only — reserved-TLD emails, "Demo"/"Sample"
 * names. Exports `guideArcId` and `guideCommunicationId`.
 */
export async function seed_guide(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const { userId, hoaOrgId: org } = ctx
  const vars: Record<string, string> = {}
  const { data: units } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .order('address_line1')
    .limit(2)
  const unit = (units?.[1] ?? units?.[0]) as { id: string; association_id: string } | undefined
  if (!unit) return vars

  vars.guideArcId = await findOrCreate(db, 'arc_requests', { organization_id: org, summary: 'Replace rear fence (demo)' }, {
    association_id: unit.association_id,
    unit_id: unit.id,
    submitted_by: userId,
    category: 'fence',
    scope_description: 'Replace the rear wood fence with a 6 ft sample-white vinyl fence on the same line. No change to the side gates.',
    status: 'submitted',
    proposed_start: '2026-11-09',
    proposed_completion: '2026-11-13',
    contractor_name: 'Sample Fence Co.',
  })

  vars.guideCommunicationId = await findOrCreate(
    db,
    'communications',
    { organization_id: org, subject: 'Pool closes for resurfacing (demo)' },
    {
      association_id: unit.association_id,
      category: 'announcement',
      body_html: '<p>The community pool closes Monday for resurfacing and reopens the following Friday.</p>',
      body_text: 'The community pool closes Monday for resurfacing and reopens the following Friday.',
      channels: ['email', 'portal'],
      audience_definition: { kind: 'all' },
      audience_summary: 'Everyone (3)',
      status: 'sent',
      source: 'manual',
      sent_at: '2026-09-28T15:00:00Z',
      created_by: userId,
      sent_by: userId,
    },
  )
  const { count } = await db
    .from('communication_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('communication_id', vars.guideCommunicationId)
  if (!count) {
    const rows = [
      { email: 'owner-101@example.test', delivery_status: 'opened' },
      { email: 'owner-103@example.test', delivery_status: 'delivered' },
      { email: 'owner-105@example.test', delivery_status: 'delivered' },
    ].map((r, i) => ({
      organization_id: org,
      communication_id: vars.guideCommunicationId,
      unit_id: (units?.[0] as { id: string } | undefined)?.id ?? null,
      recipient_name: `Sample Owner ${i + 1}`,
      email: r.email,
      channel: 'email',
      delivery_status: r.delivery_status,
      sent_at: '2026-09-28T15:00:00Z',
      delivered_at: '2026-09-28T15:00:05Z',
      opened_at: r.delivery_status === 'opened' ? '2026-09-28T16:10:00Z' : null,
    }))
    const { error } = await db.from('communication_recipients').insert(rows)
    if (error) throw new Error(`communication_recipients insert: ${error.code}`)
  }
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
  const { data } = await q.limit(1)
  const found = (data?.[0] as { id: string } | undefined)?.id
  if (found) return found
  const { data: row, error } = await db.from(table).insert({ ...match, ...rest }).select('id').single()
  if (error || !row) throw new Error(`${table} insert: ${error?.code}`)
  return (row as { id: string }).id
}
