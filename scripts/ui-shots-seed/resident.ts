import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for the resident-portal shots: the shots user owns one unit in
 * the demo HOA and has a ticket, an ARC application and a concern report,
 * each with a board reply, plus a couple of dues charges when the org has a
 * fiscal period. Idempotent (find-or-create); invented data only.
 */
export async function seed_resident(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const { userId, hoaOrgId: org } = ctx
  const vars: Record<string, string> = {}

  // A unit to own.
  const { data: units } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .order('address_line1')
    .limit(1)
  const unit = units?.[0] as { id: string; association_id: string } | undefined
  if (!unit) return vars

  const { data: own } = await db
    .from('ownerships')
    .select('id, unit_id')
    .eq('owner_user_id', userId)
    .is('valid_to', null)
    .limit(1)
  const unitId = (own?.[0] as { unit_id: string } | undefined)?.unit_id ?? unit.id
  if (!own?.length) {
    const { error } = await db.from('ownerships').insert({
      organization_id: org,
      unit_id: unit.id,
      owner_user_id: userId,
      valid_from: '2023-04-01',
      ownership_pct: 100,
      source: 'ui-shots',
    })
    if (error) throw new Error(`ownerships insert: ${error.code}`)
  }
  const assoc = unit.association_id

  // Ticket + board reply.
  vars.residentTicketId = await findOrCreate(db, 'tickets', { submitted_by: userId, subject: 'Pool gate latch is sticking' }, {
    organization_id: org,
    association_id: assoc,
    unit_id: unitId,
    category: 'common_area',
    description: 'The latch on the pool gate by the clubhouse does not close on its own. It has to be pushed shut every time.',
    status: 'in_progress',
    priority: 'normal',
  })
  await findOrCreate(db, 'ticket_messages', { ticket_id: vars.residentTicketId, author_role: 'board' }, {
    author_id: userId,
    body: 'Thanks for flagging this. A vendor is scheduled to replace the latch on Thursday morning.',
  })
  await findOrCreate(db, 'tickets', { submitted_by: userId, subject: 'Streetlight out near mailbox cluster' }, {
    organization_id: org,
    association_id: assoc,
    unit_id: unitId,
    category: 'maintenance',
    description: 'The light post next to the mailboxes has been dark for a week.',
    status: 'closed',
    priority: 'low',
  })

  // ARC application + board reply.
  vars.residentArcId = await findOrCreate(db, 'arc_requests', { submitted_by: userId, summary: 'Repaint front door and shutters' }, {
    organization_id: org,
    association_id: assoc,
    unit_id: unitId,
    category: 'paint',
    scope_description: 'Repaint the front door and shutters in an approved palette color (Sample Navy). No changes to trim.',
    status: 'in_review',
    proposed_start: '2026-11-02',
    proposed_completion: '2026-11-06',
    contractor_name: 'Sample Painting Co.',
  })
  await findOrCreate(db, 'arc_request_messages', { arc_request_id: vars.residentArcId, author_role: 'board' }, {
    author_id: userId,
    body: 'Could you attach a photo of the paint chip? The committee meets on the 28th.',
  })

  // Concern report.
  vars.residentReportId = await findOrCreate(db, 'resident_violation_reports', { reported_by: userId, category: 'parking' }, {
    organization_id: org,
    association_id: assoc,
    description: 'A trailer has been parked on the street overnight for more than a week.',
    about_address: '7 Sample Way',
    status: 'under_review',
  })

  // Dues, only when the org already has a fiscal period to hang them on.
  const { data: fp } = await db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc)
    .order('start_date', { ascending: false })
    .limit(1)
  const periodId = (fp?.[0] as { id: string } | undefined)?.id
  if (periodId) {
    for (const [due_date, status] of [
      ['2026-10-01', 'open'],
      ['2026-09-01', 'paid'],
    ] as const) {
      await findOrCreate(db, 'assessments', { unit_id: unitId, due_date, assessment_type: 'regular' }, {
        organization_id: org,
        association_id: assoc,
        fiscal_period_id: periodId,
        amount: 325,
        status,
      })
    }
  }

  console.log(`seed resident: ok (${Object.keys(vars).length} ids)`)
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
