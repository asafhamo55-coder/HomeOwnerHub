import type { SupabaseClient } from '@supabase/supabase-js'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAllResult } from '@/lib/supabase/read-all'
import { orgTimeZone } from '@/lib/association-time-server'
import { dayOf, todayIn } from '@/lib/association-time'
import { ticketAgeDays } from '@/lib/tickets-board'
import { ticketSearchClause, withTicketFilters } from '@/lib/tickets-filter'
import { TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS } from '@/lib/status/community'
import { csvDocument } from '@/lib/csv'

/**
 * GET /tickets/export?status=<open|in_progress|closed>&q=<text> — the board
 * tickets list as CSV.
 *
 * Board/admin only, checked before any client is made. Read-only. The status
 * and search filters are the page's own (ticketSearchClause, withTicketFilters), so the file is
 * the list for that view. The resident is a name only, never an email.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const STATUSES = ['open', 'in_progress', 'closed'] as const
const HEADER = ['Subject', 'Category', 'Priority', 'Status', 'Resident', 'Unit', 'Opened', 'Age in days']

interface PageQuery {
  eq(column: string, value: string): PageQuery
  or(filter: string): PageQuery
  order(column: string, opts?: { ascending: boolean }): PageQuery
  range(from: number, to: number): unknown
}

interface TicketRow {
  id: string
  category: string
  subject: string
  status: string
  priority: string
  created_at: string
  unit: { unit_number: string | null } | null
  submitter: { full_name: string | null } | null
}

export const GET = withRoute('tickets.export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const params = new URL(request.url).searchParams
  const status = STATUSES.find((s) => s === params.get('status'))
  const q = (params.get('q') ?? '').trim().slice(0, 80)

  const supabase = (await getSupabaseServerClient()) as unknown as SupabaseClient
  const timeZone = await orgTimeZone(supabase, orgId)

  // The search needs a lookup first; a failure there must not become an
  // unfiltered file.
  const search = await ticketSearchClause(supabase, q)
  if (!search.ok) {
    logRouteFailure('tickets.export.filter', new Error('filter lookup failed'), { orgId })
    throw new ApiRouteError('internal')
  }

  // Paged to the end: one read stops at PostgREST's 1000-row cap. A fresh
  // query per page, `id` as the tiebreak so pages never overlap.
  const { data, error } = await readAllResult<TicketRow>(
    (from, to) =>
      withTicketFilters(
        supabase
          .from('tickets' as never)
          .select(
            'id, category, subject, status, priority, created_at, unit:units(unit_number), submitter:profiles!tickets_submitted_by_fkey(full_name)',
          )
          .eq('organization_id', orgId)
          .is('deleted_at', null) as never as PageQuery,
        { status, clause: search.clause },
      )
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: TicketRow[] | null; error: { code?: string; message?: string } | null }>,
  )
  if (error) {
    logRouteFailure('tickets.export.read', new Error(error.message ?? 'read failed'), { orgId })
    throw new ApiRouteError('internal')
  }

  const body = csvDocument(
    HEADER,
    (data ?? []).map((t) => [
      t.subject,
      TICKET_CATEGORY[t.category] ?? t.category,
      TICKET_PRIORITY.labels[t.priority] ?? t.priority,
      TICKET_STATUS.labels[t.status] ?? t.status,
      t.submitter?.full_name ?? '',
      t.unit?.unit_number ?? '',
      dayOf(t.created_at, timeZone) ?? '',
      ticketAgeDays(t.created_at, timeZone) ?? '',
    ]),
  )

  const today = todayIn(timeZone)
  const tag = `${status ? `-${status}` : ''}${q ? '-search' : ''}`
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tickets${tag}-${today}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
