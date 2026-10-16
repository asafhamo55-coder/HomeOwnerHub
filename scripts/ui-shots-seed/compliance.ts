import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/**
 * Demo rows for /legal/compliance (BL-015) in the demo FL HOA: a few
 * documents so the records list shows on-file / out-of-date / missing
 * lines, and two meetings dated relative to today so the notices list shows
 * an "added too late" line and an "not recorded" line.
 *
 * Idempotent: rows are found by a "ui-shots:" key. Meeting dates and
 * created_at are re-set on each run so they stay inside the page's window.
 * No file is uploaded — storage_path points nowhere. Invented data only.
 */
const DAY = 86_400_000

export async function seed_compliance(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const org = ctx.hoaOrgId
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  const docs: { name: string; type: string; created: number }[] = [
    { name: 'ui-shots: Declaration of Covenants', type: 'ccr', created: now - 400 * DAY },
    { name: 'ui-shots: Bylaws (as amended)', type: 'bylaws', created: now - 400 * DAY },
    { name: 'ui-shots: 2026 Annual Budget', type: 'other', created: now - 60 * DAY },
    { name: 'ui-shots: Insurance policies 2024', type: 'other', created: now - 500 * DAY },
  ]
  for (const d of docs) {
    await upsertByKey(db, 'hoa_documents', { org_id: org, name: d.name }, {
      type: d.type,
      storage_path: `${org}/ui-shots-placeholder.pdf`,
      created_at: iso(d.created),
    })
  }

  const meetings: { key: string; type: string; inDays: number; addedDaysAgo: number }[] = [
    { key: 'ui-shots: annual meeting agenda', type: 'annual', inDays: 9, addedDaysAgo: 1 },
    { key: 'ui-shots: regular board meeting agenda', type: 'regular', inDays: 24, addedDaysAgo: 2 },
  ]
  for (const m of meetings) {
    await upsertByKey(db, 'hoa_meeting_minutes', { org_id: org, ai_summary: m.key }, {
      meeting_type: m.type,
      meeting_date: iso(now + m.inDays * DAY).slice(0, 10),
      status: 'draft',
      created_at: iso(now - m.addedDaysAgo * DAY),
    })
  }

  console.log('seed compliance: ok')
  return {}
}

async function upsertByKey(
  db: SupabaseClient,
  table: string,
  match: Record<string, string>,
  rest: Record<string, unknown>,
): Promise<void> {
  let q = db.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data, error: findErr } = await q.limit(1)
  if (findErr) throw new Error(`${table} find: ${findErr.code}`)
  const found = (data?.[0] as { id: string } | undefined)?.id
  const { error } = found
    ? await db.from(table).update(rest).eq('id', found)
    : await db.from(table).insert({ ...match, ...rest })
  if (error) throw new Error(`${table} ${found ? 'update' : 'insert'}: ${error.code}`)
}
