'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireBoardOrAdmin } from '@/lib/auth'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

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

export async function listTicketsForBoard(opts?: {
  status?: TicketStatus
}): Promise<TicketBoardRow[]> {
  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('tickets' as never)
    .select(
      'id, unit_id, submitted_by, category, subject, status, priority, created_at, unit:units(unit_number), submitter:profiles!tickets_submitted_by_fkey(full_name, email)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data } = await query

  const rows = (data ?? []) as unknown as Array<{
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

  return rows.map((r) => ({
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
  }))
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('ticket_messages' as never)
    .insert({
      ticket_id: parsed.data.ticketId,
      author_id: user.id,
      author_role: 'board',
      body: parsed.data.body,
      internal: parsed.data.internal,
    } as never)

  if (error) return { ok: false, error: error.message }

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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
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
  const { data } = await supabase
    .from('meeting_action_items' as never)
    .select('id, title, status, priority, assignee_name, due_date, created_at')
    .eq('ticket_id' as never, ticketId)
    .order('created_at' as never, { ascending: true })
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
