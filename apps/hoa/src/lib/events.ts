'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { DASHBOARD_TAG } from '@/lib/dashboard/cached'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sendEventAlertEmail } from '@/lib/events-alerts'

// Recurring events — annual reminders that nudge the board ahead of
// deadlines (Annual Board Meeting, Fiscal Year End, Insurance Renewal).
//
// Schema lives in migration 0018_recurring_events.sql:
//   • hoa_recurring_events.event_date is the NEXT occurrence (cron rolls
//     it forward +1y when it fires, for recurrence='annual').
//   • alert_days_before drives when the cron emails the board.
//   • last_alert_sent_for is the idempotency anchor — if it equals the
//     current event_date, we've already alerted for this occurrence.
//
// Mirrors the API shape of lib/leases.ts; both use the user-bound
// supabase client so RLS gates writes, and both gate at the action
// layer with getCurrentUserRoleInOrg.

type ActionOk<T> = T extends void ? { ok: true } : { ok: true; data: T }
type ActionErr = { ok: false; error: string }
export type ActionResult<T = void> = ActionOk<T> | ActionErr

export type Recurrence = 'annual' | 'none'

export interface RecurringEvent {
  id: string
  title: string
  description: string | null
  event_date: string // ISO YYYY-MM-DD
  recurrence: Recurrence
  alert_days_before: number
  last_alert_sent_at: string | null
  last_alert_sent_for: string | null
  is_active: boolean
  association_id: string | null
  created_at: string
}

// ─── Reads ───────────────────────────────────────────────────────────

const SELECT_COLUMNS =
  'id, title, description, event_date, recurrence, alert_days_before, last_alert_sent_at, last_alert_sent_for, is_active, association_id, created_at'

export async function listEvents(): Promise<RecurringEvent[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_recurring_events' as never)
    .select(SELECT_COLUMNS)
    .order('event_date', { ascending: true })
    .limit(500)

  return (data ?? []) as unknown as RecurringEvent[]
}

export async function getEvent(id: string): Promise<RecurringEvent | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_recurring_events' as never)
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle<RecurringEvent>()
  return data ?? null
}

// ─── Validation ──────────────────────────────────────────────────────

// Reused by create + update. Update partials apply .partial() at call
// site so we can reuse the same constraints.
const EventFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(200, 'Title must be 200 characters or fewer.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be 2000 characters or fewer.')
    .nullable()
    .optional(),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Event date must be YYYY-MM-DD.'),
  recurrence: z.enum(['annual', 'none']),
  alert_days_before: z
    .number()
    .int('Alert days must be a whole number.')
    .min(0, 'Alert days must be 0 or more.')
    .max(90, 'Alert days must be 90 or fewer.'),
  association_id: z.string().uuid().nullable().optional(),
})

export interface CreateEventInput {
  title: string
  description?: string | null
  event_date: string
  recurrence: Recurrence
  alert_days_before: number
  association_id?: string | null
}

export interface UpdateEventInput {
  title?: string
  description?: string | null
  event_date?: string
  recurrence?: Recurrence
  alert_days_before?: number
  association_id?: string | null
}

// ─── Mutations ───────────────────────────────────────────────────────

export async function createEvent(
  input: CreateEventInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = EventFieldsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data, error } = await supabase
    .from('hoa_recurring_events' as never)
    .insert({
      organization_id: org.id,
      association_id: parsed.data.association_id ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      event_date: parsed.data.event_date,
      recurrence: parsed.data.recurrence,
      alert_days_before: parsed.data.alert_days_before,
      is_active: true,
      created_by: user.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not create event.' }
  }

  revalidatePath('/')  // dashboard rollup
  revalidatePath('/events')
  revalidateTag(DASHBOARD_TAG(org.id))
  return { ok: true, data: { id: data.id } }
}

export async function updateEvent(
  id: string,
  partial: UpdateEventInput,
): Promise<ActionResult> {
  const parsed = EventFieldsSchema.partial().safeParse(partial)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description ?? null
  if (parsed.data.event_date !== undefined) patch.event_date = parsed.data.event_date
  if (parsed.data.recurrence !== undefined) patch.recurrence = parsed.data.recurrence
  if (parsed.data.alert_days_before !== undefined)
    patch.alert_days_before = parsed.data.alert_days_before
  if (parsed.data.association_id !== undefined)
    patch.association_id = parsed.data.association_id ?? null

  const { error } = await supabase
    .from('hoa_recurring_events' as never)
    .update(patch as never)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/events')
  revalidatePath(`/events/${id}`)
  return { ok: true }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('hoa_recurring_events' as never)
    .delete()
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/events')
  return { ok: true }
}

export async function toggleEventActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('hoa_recurring_events' as never)
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/events')
  revalidatePath(`/events/${id}`)
  return { ok: true }
}

// ─── Test-send (manual fire from the detail page) ────────────────────

export async function sendTestAlert(
  eventId: string,
): Promise<ActionResult<{ sent: number; failed: number }>> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const event = await getEvent(eventId)
  if (!event) return { ok: false, error: 'Event not found.' }

  const result = await sendEventAlertEmail({
    event,
    organizationId: org.id,
  })

  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  return {
    ok: true,
    data: { sent: result.sent, failed: result.failed.length },
  }
}
