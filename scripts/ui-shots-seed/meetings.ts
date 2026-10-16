import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Two board meetings for the BL-016 board packet shot
 * (`/meetings/:meetingId/packet`): an upcoming one with an agenda, and the
 * one before it with action items, so the "previous meeting" section has
 * rows. Fixed dates keep the packet period stable between runs (September
 * 2026). Idempotent (find-or-create on a marker); invented data only.
 */
export async function seed_meetings(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId

  const previousId = await findOrCreate(
    db,
    'hoa_meeting_minutes',
    { org_id: org, raw_transcript: 'ui-shots: previous board meeting' },
    {
      meeting_date: '2026-09-16',
      meeting_type: 'regular',
      status: 'approved',
      ai_summary: 'The board reviewed the August financials and the pool resurfacing bids.',
    },
  )
  const items: [string, string, string | null, string][] = [
    ['ui-shots: collect three pool resurfacing bids', 'Treasurer', '2026-10-01', 'done'],
    ['ui-shots: send the fence-height reminder to the whole community, including the phrase that wraps', 'Secretary', '2026-10-10', 'in_progress'],
    ['ui-shots: review the reserve study draft', 'Board', null, 'open'],
  ]
  for (const [title, assignee, due, status] of items) {
    await findOrCreate(
      db,
      'meeting_action_items',
      { org_id: org, meeting_id: previousId, title },
      {
        assignee_name: assignee,
        due_date: due,
        status,
        priority: 'normal',
        // CHECK: completed_at is set iff the item is done/cancelled.
        completed_at: status === 'done' ? '2026-09-30T17:00:00Z' : null,
      },
    )
  }

  const meetingId = await findOrCreate(
    db,
    'hoa_meeting_minutes',
    { org_id: org, raw_transcript: 'ui-shots: board packet meeting' },
    {
      meeting_date: '2026-10-21',
      meeting_type: 'regular',
      status: 'draft',
      ai_summary:
        '1. Approve the September minutes\n2. Treasurer’s report: September financials and delinquency\n3. Pool resurfacing — choose a bid\n\n4. Open violations and ARC applications\n5. Owner comments',
    },
  )

  console.log('seed meetings: ok')
  return { meetingId }
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
