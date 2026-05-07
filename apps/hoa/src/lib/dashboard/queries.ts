import { getSupabaseServerClient } from '@/lib/supabase/server'

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

// All counts come back as a single round-trip per stat. We use head:true +
// count:'exact' which returns just the count, no rows. Cheap.
export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await getSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)

  const [open, overdue, pending, dues] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['open', 'notice_sent']),

    // Overdue = notice was sent AND today is past notice_sent_at + cure_period_days.
    // Done as a SQL filter via .lt() on a computed string would require an RPC;
    // instead, fetch the small set of open violations with a notice and filter
    // in JS. Phase 1 volumes (49 properties) make this trivial.
    supabase
      .from('hoa_violations')
      .select('notice_sent_at, cure_period_days')
      .eq('org_id', orgId)
      .eq('status', 'notice_sent')
      .not('notice_sent_at', 'is', null),

    // Pending approvals = AI drafted a letter but a human hasn't approved it.
    supabase
      .from('hoa_violations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('ai_draft_letter', 'is', null)
      .is('approved_at', null),

    // Overdue dues: due_date < today AND not paid.
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
