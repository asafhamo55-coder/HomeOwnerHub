import type { SupabaseClient } from '@supabase/supabase-js'
import { readAll } from '@/lib/supabase/read-all'

/**
 * The /dues "Overdue" headline: every charge not paid or waived and due
 * before `today` ('YYYY-MM-DD'; a charge due today is not late).
 *
 * Read with `readAll`, not `.range(0, 49_999)`: PostgREST caps each
 * response at max_rows (1000) whatever range is asked for, so the old
 * single read summed at most 1000 charges and undercounted a large
 * association with no sign it had (BL-047). Throws on any failed page —
 * the page renders the KPIs as "Couldn't load", never a partial total.
 */
export interface OverdueHeadline {
  totalOverdue: number
  /** Distinct units with an open overdue balance (a unit-less charge counts once, as before). */
  unitsBehind: number
  oldestDue: string | null
}

interface OverdueRow {
  amount: number | string
  due_date: string
  unit_id: string | null
  payments: { amount: number | string }[] | null
}

type QueryError = { code?: string; message?: string }
type Page = PromiseLike<{ data: OverdueRow[] | null; error: QueryError | null }>

export async function loadOverdueHeadline(
  db: SupabaseClient,
  associationId: string,
  today: string,
): Promise<OverdueHeadline> {
  const rows = await readAll<OverdueRow>(
    (from, to) =>
      db
        .from('assessments')
        .select('id, amount, due_date, unit_id, payments(amount)')
        .eq('association_id', associationId)
        .is('deleted_at', null)
        .neq('status', 'paid')
        .neq('status', 'waived')
        .lt('due_date', today)
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page,
    (e) => new Error(`overdue dues total failed (${e.code ?? 'no code'})`),
  )

  let totalOverdue = 0
  let oldestDue: string | null = null
  const units = new Set<string | null>()
  for (const r of rows) {
    const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const open = Math.max(Number(r.amount) - paid, 0)
    totalOverdue += open
    if (open > 0) {
      units.add(r.unit_id)
      if (!oldestDue || r.due_date < oldestDue) oldestDue = r.due_date
    }
  }
  return { totalOverdue, unitsBehind: units.size, oldestDue }
}
