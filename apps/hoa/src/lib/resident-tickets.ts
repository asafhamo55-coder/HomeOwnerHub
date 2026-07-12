'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getResidentUnits } from '@/lib/resident'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

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

export type TicketStatus = 'open' | 'in_progress' | 'closed'

export interface TicketRow {
  id: string
  unit_id: string | null
  category: TicketCategory
  subject: string
  status: TicketStatus
  priority: string
  created_at: string
}

export interface TicketDetail extends TicketRow {
  description: string
  closed_at: string | null
  messages: TicketMessageRow[]
}

export interface TicketMessageRow {
  id: string
  author_role: 'resident' | 'board' | 'admin'
  author_name: string | null
  body: string
  created_at: string
}

const TicketCategorySchema = z.enum([
  'maintenance', 'noise', 'parking', 'common_area',
  'billing', 'access', 'safety', 'general', 'other',
])

const CreateTicketSchema = z.object({
  unit_id: z.string().uuid('Pick a unit.'),
  category: TicketCategorySchema,
  subject: z.string().trim().min(5, 'Subject is too short.').max(200),
  description: z.string().trim().min(20, 'Describe your issue in more detail.').max(4000),
})

export interface CreateTicketInput {
  unitId: string
  category: TicketCategory
  subject: string
  description: string
}

export async function listMyTickets(): Promise<TicketRow[]> {
  const actor = await getResidentActor()
  if (!actor.id) return []
  const { data } = await actor.client
    .from('tickets' as never)
    .select('id, unit_id, category, subject, status, priority, created_at')
    .eq('submitted_by', actor.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data ?? []) as unknown as TicketRow[]
}

export async function getMyTicket(id: string): Promise<TicketDetail | null> {
  const actor = await getResidentActor()
  if (!actor.id) return null

  const { data: ticket } = await actor.client
    .from('tickets' as never)
    .select('id, unit_id, category, subject, description, status, priority, created_at, closed_at')
    .eq('id', id)
    .eq('submitted_by', actor.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!ticket) return null

  // `internal: false` reproduces the resident's exact visibility: residents
  // never see internal staff notes. Explicit here because the impersonated
  // path uses a service-role client that would otherwise bypass that RLS.
  const { data: msgs } = await actor.client
    .from('ticket_messages' as never)
    .select('id, author_role, body, created_at, author:profiles!ticket_messages_author_id_fkey(full_name)')
    .eq('ticket_id', id)
    .eq('internal' as never, false)
    .order('created_at', { ascending: true })

  const t = ticket as unknown as TicketDetail
  t.messages = ((msgs ?? []) as unknown as Array<{
    id: string
    author_role: 'resident' | 'board' | 'admin'
    body: string
    created_at: string
    author: { full_name: string | null } | null
  }>).map((m) => ({
    id: m.id,
    author_role: m.author_role,
    author_name: m.author?.full_name ?? null,
    body: m.body,
    created_at: m.created_at,
  }))
  return t
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult<{ ticketId: string }>> {
  const parsed = CreateTicketSchema.safeParse({
    unit_id: input.unitId,
    category: input.category,
    subject: input.subject,
    description: input.description,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const myUnits = await getResidentUnits()
  const unit = myUnits.find((u) => u.unit_id === parsed.data.unit_id)
  if (!unit) {
    return { ok: false, error: 'You can only submit tickets for units you own.' }
  }

  const { data: row, error } = await supabase
    .from('tickets' as never)
    .insert({
      organization_id: org.id,
      association_id: unit.association_id,
      unit_id: parsed.data.unit_id,
      submitted_by: user.id,
      category: parsed.data.category,
      subject: parsed.data.subject,
      description: parsed.data.description,
      status: 'open',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Could not create ticket.' }
  }

  revalidatePath('/')
  revalidatePath('/resident')
  revalidatePath('/resident/tickets')
  return { ok: true, data: { ticketId: row.id } }
}

const AddMessageSchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().trim().min(1, 'Message cannot be empty.').max(4000),
})

export async function addTicketMessage(
  ticketId: string,
  body: string,
): Promise<ActionResult> {
  const parsed = AddMessageSchema.safeParse({ ticket_id: ticketId, body })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  if ((await getResidentActor()).impersonating) {
    return { ok: false, error: IMPERSONATION_READONLY_MSG }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('ticket_messages' as never)
    .insert({
      ticket_id: parsed.data.ticket_id,
      author_id: user.id,
      author_role: 'resident',
      body: parsed.data.body,
      internal: false,
    } as never)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/resident/tickets/${ticketId}`)
  revalidatePath(`/tickets/${ticketId}`)
  return { ok: true }
}
