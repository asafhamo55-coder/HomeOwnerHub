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

export type ApprovalKind = 'violation' | 'meeting' | 'invoice' | 'rfp'

export interface ApprovalItem {
  kind: ApprovalKind
  id: string
  title: string
  /** ISO timestamp the item became pending. */
  pendingSince: string | null
  /** Where clicking the row should land. */
  href: string
}

export interface ApprovalsInbox {
  items: ApprovalItem[]
  totalCount: number
}

export type AtRiskKind = 'cure_deadline' | 'dues_overdue' | 'coi_expiring'

export interface AtRiskItem {
  kind: AtRiskKind
  id: string
  /** Plain-English row title, e.g. "Cure deadline · 123 Oak St". */
  title: string
  /** Red = already breached / severely overdue; amber = approaching. */
  severity: 'red' | 'amber'
  /** Days from today: negative if past, positive if future. */
  daysOffset: number
  /** Where clicking the row should land. */
  href: string
}

export interface AtRiskResult {
  items: AtRiskItem[]
  totalCount: number
}

export interface NextMeetingInfo {
  id: string
  meetingDate: string
  meetingType: string | null
  daysUntil: number
  status: string | null
}

export async function getDashboardStats(orgId: string): Promise<DashboardStats> {
  const supabase = await getSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)

  // Resolve associations for this org so the v1 assessments query stays
  // tenant-scoped. Service role isn't used here (this runs from the
  // dashboard page under a user session) so RLS does the heavy lifting,
  // but the explicit IN keeps the query plan tight.
  const { data: assocs } = await supabase
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
  const assocIds = (assocs ?? []).map((a) => a.id)

  const assessmentsPromise =
    assocIds.length > 0
      ? supabase
          .from('assessments')
          .select('id, amount, unit_id, status, payments(amount)')
          .in('association_id', assocIds)
          .neq('status', 'paid')
          .neq('status', 'waived')
          .neq('status', 'written_off')
          .lt('due_date', today)
      : Promise.resolve({ data: [] as { id: string; amount: number; unit_id: string; status: string; payments: { amount: number }[] }[] })

  const [open, overdue, pending, assessments] = await Promise.all([
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

    assessmentsPromise,
  ])

  const overdueCount = (overdue.data ?? []).filter((v) => {
    if (!v.notice_sent_at || !v.cure_period_days) return false
    const sent = new Date(v.notice_sent_at)
    const cureDeadline = new Date(sent.getTime() + v.cure_period_days * 86_400_000)
    return cureDeadline < new Date()
  }).length

  type AssessmentShape = {
    id: string
    amount: number
    unit_id: string
    status: string
    payments: { amount: number }[]
  }
  const overdueRows = (assessments.data ?? []) as unknown as AssessmentShape[]

  const overdueDuesAmount = overdueRows.reduce((sum, row) => {
    const paid = (row.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const remaining = Number(row.amount) - paid
    return sum + Math.max(remaining, 0)
  }, 0)

  const propertiesBehind = new Set(overdueRows.map((r) => r.unit_id)).size

  return {
    openViolations: open.count ?? 0,
    overdueViolations: overdueCount,
    pendingApprovals: pending.count ?? 0,
    overdueDuesAmount,
    propertiesBehind,
  }
}

// Unions every "manager owes an approval" source so the dashboard can
// surface a single "waiting on you" list instead of scattering pending
// items across four separate pages.
export async function getApprovalsInbox(orgId: string): Promise<ApprovalsInbox> {
  const supabase = await getSupabaseServerClient()

  const [violations, minutes, invoices, rfps] = await Promise.all([
    // AI-drafted violation letters awaiting human approval (Bar B gate).
    supabase
      .from('hoa_violations')
      .select(
        'id, description, created_at, property:hoa_properties(address, unit_number)',
      )
      .eq('org_id', orgId)
      .not('ai_draft_letter', 'is', null)
      .is('approved_at', null)
      .order('created_at', { ascending: false })
      .limit(10),

    // Meeting minutes that haven't been approved by the board yet.
    supabase
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status, updated_at')
      .eq('org_id', orgId)
      .neq('status', 'approved')
      .order('meeting_date', { ascending: false })
      .limit(10),

    // Invoices coded by AI and awaiting manager review before posting.
    supabase
      .from('invoices')
      .select(
        'id, invoice_number, amount, created_at, vendor:vendors(legal_name)',
      )
      .eq('organization_id', orgId)
      .eq('status', 'coded')
      .order('created_at', { ascending: false })
      .limit(10),

    // RFPs the AI composer drafted but the manager hasn't published.
    supabase
      .from('rfps')
      .select('id, rfp_number, title, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'draft')
      .eq('ai_generated', true)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ApprovalItem[] = []

  type VRow = {
    id: string
    description: string
    created_at: string | null
    property: { address: string; unit_number: string | null } | null
  }
  for (const v of (violations.data ?? []) as unknown as VRow[]) {
    const place = v.property
      ? `${v.property.address}${v.property.unit_number ? ' · ' + v.property.unit_number : ''}`
      : 'Property unknown'
    items.push({
      kind: 'violation',
      id: v.id,
      title: `Violation · ${place}`,
      pendingSince: v.created_at,
      href: `/violations/${v.id}`,
    })
  }

  type MRow = {
    id: string
    meeting_date: string
    meeting_type: string | null
    status: string | null
    updated_at: string | null
  }
  for (const m of (minutes.data ?? []) as unknown as MRow[]) {
    const when = m.meeting_date
      ? new Date(m.meeting_date).toLocaleDateString()
      : 'Date TBD'
    items.push({
      kind: 'meeting',
      id: m.id,
      title: `Meeting minutes · ${when}${m.meeting_type ? ' · ' + m.meeting_type : ''}`,
      pendingSince: m.updated_at ?? m.meeting_date,
      href: `/meetings/${m.id}`,
    })
  }

  type IRow = {
    id: string
    invoice_number: string
    amount: number
    created_at: string | null
    vendor: { legal_name: string } | null
  }
  for (const i of (invoices.data ?? []) as unknown as IRow[]) {
    const amt = Number(i.amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
    items.push({
      kind: 'invoice',
      id: i.id,
      title: `Invoice ${i.invoice_number} · ${amt}${i.vendor ? ' · ' + i.vendor.legal_name : ''}`,
      pendingSince: i.created_at,
      href: `/accounting/invoices/${i.id}`,
    })
  }

  type RRow = {
    id: string
    rfp_number: string
    title: string
    created_at: string | null
  }
  for (const r of (rfps.data ?? []) as unknown as RRow[]) {
    items.push({
      kind: 'rfp',
      id: r.id,
      title: `Draft RFP ${r.rfp_number} · ${r.title}`,
      pendingSince: r.created_at,
      href: `/rfps/${r.id}`,
    })
  }

  // Oldest pending items first — they've been waiting longest.
  items.sort((a, b) => {
    const at = a.pendingSince ? new Date(a.pendingSince).getTime() : 0
    const bt = b.pendingSince ? new Date(b.pendingSince).getTime() : 0
    return at - bt
  })

  return { items, totalCount: items.length }
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

  // assessments replaces hoa_dues for the heat map's dues lane. Query
  // is org-wide via the associations FK.
  const { data: assocs } = await supabase
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
  const assocIds = (assocs ?? []).map((a) => a.id)

  const duesPromise =
    assocIds.length > 0
      ? supabase
          .from('assessments')
          .select('id, due_date, status')
          .in('association_id', assocIds)
          .gte('due_date', startISO)
          .lte('due_date', endISO)
      : Promise.resolve({ data: [] as { id: string; due_date: string; status: string }[] })

  const [violations, dues] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id, status, notice_sent_at, cure_period_days')
      .eq('org_id', orgId)
      .not('notice_sent_at', 'is', null),
    duesPromise,
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

/**
 * Union of "things that will hurt you this week if you don't act":
 *   1. Violation cure deadlines elapsing in the next 7 days (or past).
 *   2. Assessments overdue more than 30 days.
 *   3. Vendor COIs expiring within 30 days.
 *
 * Sorted by urgency (most-overdue first), capped at 6 visible items.
 * `totalCount` reflects the full at-risk set so the UI can show overflow.
 */
export async function getAtRiskThisWeek(orgId: string): Promise<AtRiskResult> {
  const supabase = await getSupabaseServerClient()
  const today = new Date()
  const todayMs = today.getTime()
  const todayISO = today.toISOString().slice(0, 10)
  const in30ISO = new Date(todayMs + 30 * 86_400_000).toISOString().slice(0, 10)
  const thirtyDaysAgoISO = new Date(todayMs - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10)

  // Tenant-scope assessments via associations FK; matches getDashboardStats.
  const { data: assocs } = await supabase
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
  const assocIds = (assocs ?? []).map((a) => a.id)

  const assessmentsPromise =
    assocIds.length > 0
      ? supabase
          .from('assessments')
          .select(
            'id, due_date, amount, status, unit:units(unit_number)',
          )
          .in('association_id', assocIds)
          .not('status', 'in', '("paid","waived","written_off")')
          .lt('due_date', thirtyDaysAgoISO)
      : Promise.resolve({
          data: [] as {
            id: string
            due_date: string
            amount: number
            status: string
            unit: { unit_number: string | null } | null
          }[],
        })

  const [violations, assessments, cois] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select(
        'id, description, notice_sent_at, cure_period_days, property:hoa_properties(address, unit_number)',
      )
      .eq('org_id', orgId)
      .eq('status', 'notice_sent')
      .not('notice_sent_at', 'is', null),

    assessmentsPromise,

    supabase
      .from('vendor_compliance' as never)
      .select(
        'vendor_id, coi_expiration_date, vendor:vendors(legal_name)',
      )
      .eq('organization_id', orgId)
      .gte('coi_expiration_date', todayISO)
      .lte('coi_expiration_date', in30ISO),
  ])

  const items: AtRiskItem[] = []
  const sevenDayCutoff = todayMs + 7 * 86_400_000

  // 1) Violation cure deadlines.
  type VRow = {
    id: string
    description: string | null
    notice_sent_at: string | null
    cure_period_days: number | null
    property: { address: string; unit_number: string | null } | null
  }
  for (const v of (violations.data ?? []) as unknown as VRow[]) {
    if (!v.notice_sent_at || !v.cure_period_days) continue
    const cureMs =
      new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000
    if (cureMs >= sevenDayCutoff) continue
    const daysOffset = Math.round((cureMs - todayMs) / 86_400_000)
    const place = v.property
      ? `${v.property.address}${v.property.unit_number ? ' · ' + v.property.unit_number : ''}`
      : 'Property unknown'
    items.push({
      kind: 'cure_deadline',
      id: v.id,
      title: `Cure deadline · ${place}`,
      severity: daysOffset < 0 ? 'red' : 'amber',
      daysOffset,
      href: `/violations/${v.id}`,
    })
  }

  // 2) Assessments overdue more than 30 days.
  type ARow = {
    id: string
    due_date: string
    amount: number
    status: string
    unit: { unit_number: string | null } | null
  }
  for (const a of (assessments.data ?? []) as unknown as ARow[]) {
    if (!a.due_date) continue
    const dueMs = new Date(a.due_date).getTime()
    const daysOffset = Math.round((dueMs - todayMs) / 86_400_000)
    const amt = Number(a.amount).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    })
    const unitLabel = a.unit?.unit_number ? `Unit ${a.unit.unit_number}` : 'Unit'
    items.push({
      kind: 'dues_overdue',
      id: a.id,
      title: `Dues overdue · ${unitLabel} · ${amt}`,
      // >60 days overdue is "this is becoming a lien" — escalate to red.
      severity: daysOffset < -60 ? 'red' : 'amber',
      daysOffset,
      href: `/accounting/assessments/${a.id}`,
    })
  }

  // 3) Vendor COIs expiring within 30 days.
  type CRow = {
    vendor_id: string
    coi_expiration_date: string | null
    vendor: { legal_name: string } | null
  }
  for (const c of (cois.data ?? []) as unknown as CRow[]) {
    if (!c.coi_expiration_date) continue
    const expMs = new Date(c.coi_expiration_date).getTime()
    const daysOffset = Math.round((expMs - todayMs) / 86_400_000)
    const vendor = c.vendor?.legal_name ?? 'Vendor'
    items.push({
      kind: 'coi_expiring',
      id: c.vendor_id,
      title: `COI expiring · ${vendor}`,
      severity: daysOffset < 0 ? 'red' : 'amber',
      daysOffset,
      href: `/vendors/${c.vendor_id}`,
    })
  }

  // Most-overdue first.
  items.sort((a, b) => a.daysOffset - b.daysOffset)

  return { items: items.slice(0, 6), totalCount: items.length }
}

/**
 * Single next-up meeting card. Prefers the soonest future meeting; if
 * none, falls back to the most-recent past meeting whose minutes aren't
 * yet approved (so the manager has something actionable to surface).
 */
export async function getNextMeeting(
  orgId: string,
): Promise<NextMeetingInfo | null> {
  const supabase = await getSupabaseServerClient()
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  // Soonest future meeting first.
  const { data: future } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status')
    .eq('org_id', orgId)
    .gte('meeting_date', todayISO)
    .order('meeting_date', { ascending: true })
    .limit(1)

  const pick = future?.[0]
  if (pick) {
    const daysUntil = Math.round(
      (new Date(pick.meeting_date).getTime() - today.getTime()) / 86_400_000,
    )
    return {
      id: pick.id,
      meetingDate: pick.meeting_date,
      meetingType: pick.meeting_type ?? null,
      daysUntil,
      status: pick.status ?? null,
    }
  }

  // Fallback: most recent past meeting with un-approved minutes.
  const { data: past } = await supabase
    .from('hoa_meeting_minutes')
    .select('id, meeting_date, meeting_type, status')
    .eq('org_id', orgId)
    .neq('status', 'approved')
    .lt('meeting_date', todayISO)
    .order('meeting_date', { ascending: false })
    .limit(1)

  const fallback = past?.[0]
  if (!fallback) return null

  const daysUntil = Math.round(
    (new Date(fallback.meeting_date).getTime() - today.getTime()) / 86_400_000,
  )
  return {
    id: fallback.id,
    meetingDate: fallback.meeting_date,
    meetingType: fallback.meeting_type ?? null,
    daysUntil,
    status: fallback.status ?? null,
  }
}

// Re-export for callers; date-fns isSameDay is the only thing imported here
// that the dashboard page needs from this module's surface.
export { isSameDay }
