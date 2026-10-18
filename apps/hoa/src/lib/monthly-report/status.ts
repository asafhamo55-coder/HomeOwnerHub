/**
 * What the "Monthly board report" card shows (BL-073): the last report on
 * record, and whether last month's has gone out yet. Read from the
 * communications log the job writes (one row per org + month, id
 * deterministic), through the signed-in board member's RLS client.
 * THROWS on a failed read — the card says "couldn't load", never "never sent".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MONTHLY_REPORT_RESOURCE_TYPE,
  monthlyReportCommunicationId,
  previousMonthIn,
  reportMonthOf,
  type ReportMonth,
} from '@homeowner-portal/jobs/monthly-board-report'

export interface LastReport {
  month: string
  label: string
  /** 'sent' | 'failed' | 'sending' — as the communications row says. */
  status: string
  sentAt: string | null
}

export interface MonthlyReportStatus {
  last: LastReport | null
  /** The month "Send now" would send: the last finished month in the association's zone. */
  pending: ReportMonth
  /** True when that month already has a row — Send now would do nothing. */
  pendingDone: boolean
}

export async function loadMonthlyReportStatus(
  db: SupabaseClient,
  orgId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<MonthlyReportStatus> {
  const pending = previousMonthIn(timeZone, now)
  const [latest, existing] = await Promise.all([
    db
      .from('communications')
      .select('id, status, sent_at, related_resource')
      .eq('organization_id', orgId)
      .eq('related_resource->>type', MONTHLY_REPORT_RESOURCE_TYPE)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(0, 0),
    db.from('communications').select('id').eq('id', monthlyReportCommunicationId(orgId, pending.month)).maybeSingle(),
  ])
  if (latest.error) throw new Error(`monthly report status failed (${latest.error.code ?? 'no code'})`)
  if (existing.error) throw new Error(`monthly report status failed (${existing.error.code ?? 'no code'})`)

  const row = ((latest.data ?? [])[0] ?? null) as
    | { status: string; sent_at: string | null; related_resource: { month?: unknown } | null }
    | null
  const month = row && typeof row.related_resource?.month === 'string' ? reportMonthOf(row.related_resource.month) : null
  return {
    last: row && month ? { month: month.month, label: month.label, status: row.status, sentAt: row.sent_at } : null,
    pending,
    pendingDone: Boolean(existing.data),
  }
}
