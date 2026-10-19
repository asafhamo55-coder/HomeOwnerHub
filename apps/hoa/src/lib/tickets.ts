'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdmin } from '@/lib/auth'
import { loadOrFail } from '@/lib/load-or-fail'
import { notifyResidentAfterResponse } from '@/lib/resident-notify/notify'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string; fieldErrors?: Record<string, string> }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

/** First message per top-level field, for per-field form errors. */
function fieldErrorsOf(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export type TicketStatus = 'open' | 'in_progress' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export type TicketCategory =
  | 'maintenance'
  | 'noise'
  | 'parking'
  | 'common_area'
  | 'billing'
  | 'access'
  | 'safety'
  | 'general'
  | 'other'

export interface TicketBoardRow {
  id: string
  unit_id: string | null
  unit_number: string | null
  submitted_by: string
  submitter_name: string | null
  submitter_email: string | null
  category: TicketCategory
  subject: string
  status: TicketStatus
  priority: TicketPriority
  created_at: string
}

export interface TicketMessageRow {
  id: string
  author_id: string
  author_role: 'resident' | 'board' | 'admin'
  author_name: string | null
  body: string
  internal: boolean
  created_at: string
}

export interface TicketBoardDetail extends TicketBoardRow {
  description: string
  closed_at: string | null
  closed_by: string | null
  messages: TicketMessageRow[]
}

export interface TicketActionItem {
  id: string
  title: string
  status: string
  priority: string
  assignee_name: string | null
  due_date: string | null
  created_at: string
}

/**
 * One page of the board's ticket list, or `{ ok: false }` when it could not
 * be loaded. This used to resolve `data ?? []` and cap at 200 rows, so a
 * failed query read as "No tickets yet" and ticket 201 was invisible.
 *
 * `openCount` and `total` are counted over ALL matching tickets, not just
 * this page — the header states them as facts about the association.
 */
export type TicketBoardPage =
  | {
      ok: true
      rows: TicketBoardRow[]
      total: number
      openCount: number
      /** Per-status totals across the association (for the filter chips). */
      statusCounts: Record<TicketStatus, number>
    }
  | { ok: false }

export async function listTicketsForBoard(opts: {
  page: number
  pageSize: number
  status?: TicketStatus
}): Promise<TicketBoardPage> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const from = (opts.page - 1) * opts.pageSize
  let query = supabase
    .from('tickets' as never)
    .select(
      'id, unit_id, submitted_by, category, subject, status, priority, created_at, unit:units(unit_number), submitter:profiles!tickets_submitted_by_fkey(full_name, email)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (opts.status) query = query.eq('status', opts.status)

  const countFor = (status: TicketStatus) =>
    loadOrFail(
      `${status} ticket count`,
      supabase
        .from('tickets' as never)
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', status),
    )

  const [list, open, inProgress, closed] = await Promise.all([
    loadOrFail('tickets', query.range(from, from + opts.pageSize - 1)),
    countFor('open'),
    countFor('in_progress'),
    countFor('closed'),
  ])
  if (!list.ok || !open.ok || !inProgress.ok || !closed.ok) return { ok: false }
  const statusCounts: Record<TicketStatus, number> = {
    open: open.count ?? 0,
    in_progress: inProgress.count ?? 0,
    closed: closed.count ?? 0,
  }

  const rows = (list.data ?? []) as unknown as Array<{
    id: string
    unit_id: string | null
    submitted_by: string
    category: TicketCategory
    subject: string
    status: TicketStatus
    priority: TicketPriority
    created_at: string
    unit: { unit_number: string | null } | null
    submitter: { full_name: string | null; email: string | null } | null
  }>

  return {
    ok: true,
    total: list.count ?? rows.length,
    openCount: statusCounts.open + statusCounts.in_progress,
    statusCounts,
    rows: rows.map((r) => ({
      id: r.id,
      unit_id: r.unit_id,
      unit_number: r.unit?.unit_number ?? null,
      submitted_by: r.submitted_by,
      submitter_name: r.submitter?.full_name ?? null,
      submitter_email: r.submitter?.email ?? null,
      category: r.category,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      created_at: r.created_at,
    })),
  }
}

export async function getTicketForBoard(
  id: string,
): Promise<TicketBoardDetail | null> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data: ticket } = await supabase
    .from('tickets' as never)
    .select(
      'id, unit_id, submitted_by, category, subject, description, status, priority, created_at, closed_at, closed_by, unit:units(unit_number), submitter:profiles!tickets_submitted_by_fkey(full_name, email)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ticket) return null

  const { data: msgs } = await supabase
    .from('ticket_messages' as never)
    .select(
      'id, author_id, author_role, body, internal, created_at, author:profiles!ticket_messages_author_id_fkey(full_name)',
    )
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  const r = ticket as unknown as TicketBoardDetail & {
    unit: { unit_number: string | null } | null
    submitter: { full_name: string | null; email: string | null } | null
  }

  return {
    id: r.id,
    unit_id: r.unit_id,
    unit_number: r.unit?.unit_number ?? null,
    submitted_by: r.submitted_by,
    submitter_name: r.submitter?.full_name ?? null,
    submitter_email: r.submitter?.email ?? null,
    category: r.category,
    subject: r.subject,
    description: r.description,
    status: r.status,
    priority: r.priority,
    created_at: r.created_at,
    closed_at: r.closed_at,
    closed_by: r.closed_by,
    messages: ((msgs ?? []) as unknown as Array<{
      id: string
      author_id: string
      author_role: 'resident' | 'board' | 'admin'
      body: string
      internal: boolean
      created_at: string
      author: { full_name: string | null } | null
    }>).map((m) => ({
      id: m.id,
      author_id: m.author_id,
      author_role: m.author_role,
      author_name: m.author?.full_name ?? null,
      body: m.body,
      internal: m.internal,
      created_at: m.created_at,
    })),
  }
}

export async function respondToTicket(input: {
  ticketId: string
  body: string
  internal?: boolean
}): Promise<ActionResult> {
  const schema = z.object({
    ticketId: z.string().uuid(),
    body: z.string().trim().min(1, 'Response cannot be empty.').max(4000),
    internal: z.boolean().default(false),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }

  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: message, error } = await supabase
    .from('ticket_messages' as never)
    .insert({
      ticket_id: parsed.data.ticketId,
      author_id: user.id,
      author_role: 'board',
      body: parsed.data.body,
      internal: parsed.data.internal,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !message) return { ok: false, error: error?.message ?? 'Could not post the response.' }

  // BL-082: a reply the resident can see is emailed to them, after the
  // response, if the association turned resident notices on (off by
  // default). Internal notes never are.
  if (!parsed.data.internal) {
    notifyResidentAfterResponse(supabase, {
      kind: 'ticket_reply',
      ticketId: parsed.data.ticketId,
      messageId: message.id,
      reply: parsed.data.body,
    })
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`)
  revalidatePath(`/resident/tickets/${parsed.data.ticketId}`)
  return { ok: true }
}

export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<ActionResult> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const update: Record<string, unknown> = { status }
  if (status === 'closed') {
    update.closed_at = new Date().toISOString()
    update.closed_by = user.id
  } else {
    update.closed_at = null
    update.closed_by = null
  }

  const { error } = await supabase
    .from('tickets' as never)
    .update(update as never)
    .eq('id', ticketId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/tickets')
  revalidatePath(`/tickets/${ticketId}`)
  revalidatePath(`/resident/tickets/${ticketId}`)
  return { ok: true }
}

export async function updateTicketPriority(
  ticketId: string,
  priority: TicketPriority,
): Promise<ActionResult> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { error } = await supabase
    .from('tickets' as never)
    .update({ priority } as never)
    .eq('id', ticketId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}

export async function createActionItemFromTicket(input: {
  ticketId: string
  title: string
  description?: string
  assigneeName?: string
  dueDate?: string
  priority?: 'low' | 'normal' | 'high'
}): Promise<ActionResult<{ id: string }>> {
  const schema = z.object({
    ticketId: z.string().uuid(),
    title: z.string().trim().min(1, 'Title is required.').max(200),
    description: z.string().trim().max(2000).optional(),
    assigneeName: z.string().trim().max(120).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  })
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    }
  }

  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const { data, error } = await supabase
    .from('meeting_action_items' as never)
    .insert({
      org_id: org.id,
      ticket_id: parsed.data.ticketId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assignee_name: parsed.data.assigneeName ?? null,
      due_date: parsed.data.dueDate && parsed.data.dueDate !== '' ? parsed.data.dueDate : null,
      priority: parsed.data.priority,
      status: 'open',
      created_by: user.id,
    } as never)
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not create action item.' }
  }

  revalidatePath(`/tickets/${parsed.data.ticketId}`)
  return { ok: true, data: { id: (data as { id: string }).id } }
}

export async function listTicketActionItems(
  ticketId: string,
): Promise<TicketActionItem[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('meeting_action_items' as never)
    .select('id, title, status, priority, assignee_name, due_date, created_at')
    .eq('ticket_id' as never, ticketId)
    .order('created_at' as never, { ascending: true })
  // Throw to the route error boundary rather than render "No action items"
  // for a failed read (UX audit finding 1).
  if (error) throw new Error(`Failed to load ticket action items (${error.code ?? 'no code'})`)
  return (data ?? []) as unknown as TicketActionItem[]
}

export async function deleteTicket(ticketId: string): Promise<ActionResult> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('tickets' as never)
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', ticketId)
    .is('deleted_at', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/tickets')
  return { ok: true }
}
