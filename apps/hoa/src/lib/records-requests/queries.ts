import 'server-only'

import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { requireBoardOrAdmin } from '@/lib/auth'
import { dayOf, todayIn } from '@/lib/association-time'
import { loadOrFail } from '@/lib/load-or-fail'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  RECORDS_CATEGORY,
  dueDayOf,
  parseRecordsRequest,
  recordsChip,
  recordsDeadline,
  type RecordsChip,
  type RecordsFormat,
  type RecordsKind,
  type StatuteCitation,
} from './law'

/**
 * BL-123 (3): the board's records-request list. null while
 * RECORDS_REQUESTS_LIVE is off (the page 404s); { ok: false } on a failed
 * read so it never shows as "none". Board client, RLS-bound (0024).
 */

export interface RecordsRequestRow {
  id: string
  subject: string
  unitNumber: string | null
  submitterName: string | null
  status: 'open' | 'in_progress' | 'closed'
  receivedDay: string
  closedAt: string | null
  kind: RecordsKind | null
  format: RecordsFormat | null
  dueDate: string | null
  chip: RecordsChip
  chipLabel: string
  message: string
  citations: StatuteCitation[]
}

export type RecordsRequestList =
  | { ok: true; state: string | null; today: string; rows: RecordsRequestRow[] }
  | { ok: false }

export async function loadRecordsRequests(): Promise<RecordsRequestList | null> {
  if (!RECORDS_REQUESTS_LIVE) return null
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const assoc = await getPrimaryAssociation()
  const timeZone = assoc?.timeZone ?? 'America/New_York'
  const today = todayIn(timeZone)

  let state: string | null = null
  if (assoc) {
    const { data, error } = await supabase.from('associations').select('state').eq('id', assoc.id).maybeSingle()
    if (error) {
      console.error('[records-request] association state read failed', { code: error.code ?? null })
      return { ok: false }
    }
    state = (data as { state: string | null } | null)?.state ?? null
  }

  const res = await loadOrFail(
    'records requests',
    supabase
      .from('tickets' as never)
      .select(
        'id, subject, description, status, created_at, closed_at, records_due_at, unit:units(unit_number), submitter:profiles!tickets_submitted_by_fkey(full_name)',
      )
      .eq('category' as never, RECORDS_CATEGORY)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
  )
  if (!res.ok) return { ok: false }

  const rows = ((res.data ?? []) as unknown as Array<{
    id: string
    subject: string
    description: string
    status: 'open' | 'in_progress' | 'closed'
    created_at: string
    closed_at: string | null
    records_due_at: string | null
    unit: { unit_number: string | null } | null
    submitter: { full_name: string | null } | null
  }>).map((r): RecordsRequestRow => {
    const fields = parseRecordsRequest(r.description ?? '')
    const receivedDay = dayOf(r.created_at, timeZone) ?? today
    const deadline = recordsDeadline({ state, kind: fields.kind, period: fields.period, receivedDay })
    // The date fixed at filing wins; the recomputed one covers a request
    // filed while the state could not be read.
    const dueDate = dueDayOf(r.records_due_at) ?? deadline.dueDate
    const closed = r.status === 'closed'
    const chip = recordsChip({ dueDate, today, closed })
    return {
      id: r.id,
      subject: r.subject,
      unitNumber: r.unit?.unit_number ?? null,
      submitterName: r.submitter?.full_name ?? null,
      status: r.status,
      receivedDay,
      closedAt: r.closed_at,
      kind: fields.kind,
      format: fields.format,
      dueDate,
      chip: chip.chip,
      chipLabel: chip.label,
      message: deadline.message,
      citations: deadline.citations,
    }
  })

  // Open first, most urgent first; fulfilled last.
  const rank = (r: RecordsRequestRow) => (r.chip === 'done' ? 2 : r.dueDate ? 0 : 1)
  rows.sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  return { ok: true, state, today, rows }
}
