import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows that make the board dashboard render its busy states, so the
 * layout is exercised the way a real community sees it rather than as a
 * row of zeros: violations whose cure deadlines fall this week (the
 * "At risk this week" list, with a deliberately long address), one older
 * violation so "Open violations" carries a large percentage delta, and
 * overdue dues so the dues tile shows a multi-digit dollar value.
 *
 * Idempotent (find-or-create); invented data only.
 */
const DAY = 86_400_000

export async function seed_dashboard(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const date = (ms: number) => iso(ms).slice(0, 10)

  const propertyId = await findOrCreate(
    db,
    'hoa_properties',
    { org_id: org, address: '1200 Extraordinarily Long Sample Boulevard Northwest' },
    { unit_number: 'Unit 4B' },
  )

  // One violation that predates the 30-day window, seven inside it:
  // "Open violations 8, ↑ +700% vs 30 days ago".
  const violations: { key: string; created: number; noticeDaysAgo: number; cure: number }[] = [
    { key: 'ui-shots: older open violation', created: now - 60 * DAY, noticeDaysAgo: 50, cure: 30 },
    ...Array.from({ length: 7 }, (_, i) => ({
      key: `ui-shots: recent violation ${i + 1}`,
      created: now - (10 + i) * DAY,
      noticeDaysAgo: 10 + i,
      cure: 12 + i * 2, // cure dates spread from a few days late to a few days out
    })),
  ]
  for (const v of violations) {
    await findOrCreate(
      db,
      'hoa_violations',
      { org_id: org, description: v.key },
      {
        property_id: propertyId,
        violation_type: 'Landscaping',
        status: 'notice_sent',
        severity: 'medium',
        notice_sent_at: iso(now - v.noticeDaysAgo * DAY),
        cure_period_days: v.cure,
        created_at: iso(v.created),
      },
    )
  }

  // Overdue dues need a fiscal period to hang on.
  const { data: units } = await db
    .from('units')
    .select('id, association_id')
    .eq('organization_id', org)
    .not('association_id', 'is', null)
    .order('address_line1')
  const list = (units ?? []) as { id: string; association_id: string }[]
  if (list.length > 0) {
    const assoc = list[0].association_id
    const periodId = await findOrCreate(
      db,
      'fiscal_periods',
      { organization_id: org, association_id: assoc, start_date: '2026-01-01' },
      { end_date: '2026-12-31', status: 'open' },
    )
    for (const [i, u] of list.slice(1, 5).entries()) {
      await findOrCreate(
        db,
        'assessments',
        { unit_id: u.id, due_date: date(now - (45 + i * 20) * DAY), assessment_type: 'special' },
        { organization_id: org, association_id: assoc, fiscal_period_id: periodId, amount: 4850 + i * 1375, status: 'open' },
      )
    }
  }

  // A connected mailbox mid-way through its history import, so /inbox
  // renders the BL-005 progress banner ("Importing history — N of ~M") and
  // the dashboard checklist has a done step. Reserved-TLD address; no token
  // is stored, so nothing can ever sync from it.
  await findOrCreate(
    db,
    'mailbox_accounts',
    { organization_id: org, email_address: 'board@ui-shots.example.test' },
    {
      scope_mode: 'all',
      sync_status: 'ok',
      last_synced_at: iso(now - 3 * 60_000),
      backfill_status: 'running',
      backfill_progress: { done: 1240, total_estimate: 5300 },
    },
  )

  console.log('seed dashboard: ok')
  return {}
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
