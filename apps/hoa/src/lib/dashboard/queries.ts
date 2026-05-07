import { addDays, isSameDay, startOfMonth, endOfMonth } from 'date-fns'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { DayCell, DayLevel } from '@/components/dashboard/ComplianceHeatMap'

export interface DashboardStats {
  openViolations: number
  overdueViolations: number
  pendingApprovals: number
  overdueDuesAmount: number
  propertiesBehind: number
}

export interface DigestSnapshot {
  content: string | null
  generatedAt: string | null
}

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await getSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)

  const [open, overdue, pending, dues] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['open', 'notice_sent']),

    supabase
      .from('hoa_violations')
      .select('notice_sent_at, cure_period_days')
      .eq('org_id', orgId)
      .eq('status', 'notice_sent')
      .not('notice_sent_at', 'is', null),

    supabase
      .from('hoa_violations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('ai_draft_letter', 'is', null)
      .is('approved_at', null),

    supabase
      .from('hoa_dues')
      .select('amount_due, amount_paid, late_fee, property_id')
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .lt('due_date', today),
  ])

  const overdueCount = (overdue.data ?? []).filter((v) => {
    if (!v.notice_sent_at || !v.cure_period_days) return false
    const sent = new Date(v.notice_sent_at)
    const cureDeadline = new Date(sent.getTime() + v.cure_period_days * 86_400_000)
    return cureDeadline < new Date()
  }).length

  const overdueRows = dues.data ?? []
  const overdueDuesAmount = overdueRows.reduce((sum, row) => {
    const remaining = (row.amount_due ?? 0) + (row.late_fee ?? 0) - (row.amount_paid ?? 0)
    return sum + Math.max(remaining, 0)
  }, 0)

  const propertiesBehind = new Set(
    overdueRows.map((row) => row.property_id).filter((id): id is string => Boolean(id)),
  ).size

  return {
    openViolations: open.count ?? 0,
    overdueViolations: overdueCount,
    pendingApprovals: pending.count ?? 0,
    overdueDuesAmount,
    propertiesBehind,
  }
}

export async function getLatestDigest(orgId: string): Promise<DigestSnapshot> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_digests')
    .select('content, generated_at')
    .eq('org_id', orgId)
    .maybeSingle()

  return {
    content: data?.content ?? null,
    generatedAt: data?.generated_at ?? null,
  }
}

/**
 * Build the day-cells for a 3-month rolling Compliance Heat Map.
 * For each violation cure deadline, a dues due_date, etc., we set the
 * cell color: red if overdue, yellow if within 3 days of today, green
 * if there's an event on the day but everything's clean. Days with no
 * events stay grey.
 */
export async function getComplianceHeatMap(orgId: string): Promise<DayCell[]> {
  const supabase = await getSupabaseServerClient()
  const today = new Date()
  const start = startOfMonth(today)
  const end = endOfMonth(addDays(start, 3 * 32))
  const startISO = start.toISOString().slice(0, 10)
  const endISO = end.toISOString().slice(0, 10)

  const [violations, dues] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id, status, notice_sent_at, cure_period_days')
      .eq('org_id', orgId)
      .not('notice_sent_at', 'is', null),
    supabase
      .from('hoa_dues')
      .select('id, due_date, status')
      .eq('org_id', orgId)
      .gte('due_date', startISO)
      .lte('due_date', endISO),
  ])

  const cellMap = new Map<string, DayCell>()

  function setLevel(date: Date, level: DayLevel, note: string) {
    const key = date.toISOString().slice(0, 10)
    const existing = cellMap.get(key)
    if (!existing) {
      cellMap.set(key, { date, level, notes: [note] })
      return
    }
    // Worst level wins: red > yellow > green > grey.
    const order: Record<DayLevel, number> = { red: 3, yellow: 2, green: 1, grey: 0 }
    const newLevel = order[level] > order[existing.level] ? level : existing.level
    existing.level = newLevel
    existing.notes.push(note)
  }

  // Violation cure deadlines.
  for (const v of violations.data ?? []) {
    if (!v.notice_sent_at || !v.cure_period_days) continue
    const cureDate = new Date(
      new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000,
    )
    if (cureDate < start || cureDate > end) continue
    if (v.status === 'resolved' || v.status === 'cured') {
      setLevel(cureDate, 'green', 'cure deadline (resolved)')
    } else if (cureDate < today) {
      setLevel(cureDate, 'red', 'cure deadline elapsed')
    } else if (cureDate.getTime() - today.getTime() < 3 * 86_400_000) {
      setLevel(cureDate, 'yellow', 'cure deadline within 3 days')
    } else {
      setLevel(cureDate, 'green', 'cure deadline')
    }
  }

  // Dues due dates.
  for (const d of dues.data ?? []) {
    if (!d.due_date) continue
    const dueDate = new Date(d.due_date)
    if (d.status === 'paid') {
      setLevel(dueDate, 'green', 'dues paid')
    } else if (dueDate < today) {
      setLevel(dueDate, 'red', 'dues overdue')
    } else if (dueDate.getTime() - today.getTime() < 3 * 86_400_000) {
      setLevel(dueDate, 'yellow', 'dues due within 3 days')
    } else {
      setLevel(dueDate, 'green', 'dues due')
    }
  }

  return Array.from(cellMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )
}

// Re-export for callers; date-fns isSameDay is the only thing imported here
// that the dashboard page needs from this module's surface.
export { isSameDay }
