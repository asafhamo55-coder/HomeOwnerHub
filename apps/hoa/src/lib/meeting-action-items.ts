'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── Types ───────────────────────────────────────────────────────────

export type ActionItemStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'cancelled'

export type ActionItemPriority = 'low' | 'normal' | 'high'

export interface MeetingActionItem {
  id: string
  meeting_id: string
  title: string
  description: string | null
  assignee_name: string | null
  assignee_user_id: string | null
  due_date: string | null
  priority: ActionItemPriority
  status: ActionItemStatus
  completed_at: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string }

// ─── Read ────────────────────────────────────────────────────────────

export async function listActionItems(
  meetingId: string,
): Promise<MeetingActionItem[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('meeting_action_items' as never)
    .select('*')
    .eq('meeting_id' as never, meetingId)
    .order('status' as never, { ascending: true }) // open first, done/cancelled last
    .order('due_date' as never, { ascending: true, nullsFirst: false })
    .order('created_at' as never, { ascending: true })
  return (data ?? []) as unknown as MeetingActionItem[]
}

// ─── Create ──────────────────────────────────────────────────────────

const CreateSchema = z.object({
  meeting_id: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  description: z.string().trim().max(2000).optional(),
  assignee_name: z.string().trim().max(120).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
})

export async function createActionItem(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse({
    meeting_id: formData.get('meeting_id'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    assignee_name: formData.get('assignee_name') || undefined,
    due_date: formData.get('due_date') || undefined,
    priority: (formData.get('priority') as ActionItemPriority) || 'normal',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const insertRow: Record<string, unknown> = {
    org_id: org.id,
    meeting_id: parsed.data.meeting_id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    assignee_name: parsed.data.assignee_name ?? null,
    due_date: parsed.data.due_date && parsed.data.due_date !== '' ? parsed.data.due_date : null,
    priority: parsed.data.priority,
    status: 'open',
    created_by: user.id,
  }
  const { data, error } = await supabase
    .from('meeting_action_items' as never)
    .insert(insertRow as never)
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not create action item.' }
  }

  revalidatePath(`/meetings/${parsed.data.meeting_id}`)
  revalidatePath('/meetings')
  return { ok: true, data: { id: (data as { id: string }).id } }
}

// ─── Update status ───────────────────────────────────────────────────

const StatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']),
})

export async function setActionItemStatus(
  id: string,
  status: ActionItemStatus,
): Promise<ActionResult> {
  const parsed = StatusSchema.safeParse({ id, status })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const completed = parsed.data.status === 'done' || parsed.data.status === 'cancelled'
  const update: Record<string, unknown> = {
    status: parsed.data.status,
    completed_at: completed ? new Date().toISOString() : null,
    completed_by: completed ? user.id : null,
  }
  const { data: row, error } = await supabase
    .from('meeting_action_items' as never)
    .update(update as never)
    .eq('id' as never, parsed.data.id)
    .select('meeting_id')
    .single()

  if (error) return { ok: false, error: error.message }

  const meetingId = (row as { meeting_id?: string } | null)?.meeting_id
  if (meetingId) revalidatePath(`/meetings/${meetingId}`)
  return { ok: true }
}

// ─── Update fields (assignee, due date, priority, title, description) ─

const UpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  assignee_name: z.string().trim().max(120).nullable().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
})

export async function updateActionItem(
  id: string,
  patch: {
    title?: string
    description?: string | null
    assignee_name?: string | null
    due_date?: string | null
    priority?: ActionItemPriority
  },
): Promise<ActionResult> {
  const parsed = UpdateSchema.safeParse({ id, ...patch })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const supabase = await getSupabaseServerClient()
  const updates: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) updates.title = parsed.data.title
  if (parsed.data.description !== undefined) updates.description = parsed.data.description
  if (parsed.data.assignee_name !== undefined)
    updates.assignee_name = parsed.data.assignee_name
  if (parsed.data.due_date !== undefined) updates.due_date = parsed.data.due_date
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority

  if (Object.keys(updates).length === 0) return { ok: true }

  const { data: row, error } = await supabase
    .from('meeting_action_items' as never)
    .update(updates as never)
    .eq('id' as never, parsed.data.id)
    .select('meeting_id')
    .single()

  if (error) return { ok: false, error: error.message }

  const meetingId = (row as { meeting_id?: string } | null)?.meeting_id
  if (meetingId) revalidatePath(`/meetings/${meetingId}`)
  return { ok: true }
}

// ─── Delete ──────────────────────────────────────────────────────────

export async function deleteActionItem(id: string): Promise<ActionResult> {
  const supabase = await getSupabaseServerClient()
  const { data: row } = await supabase
    .from('meeting_action_items' as never)
    .select('meeting_id')
    .eq('id' as never, id)
    .single()

  const { error } = await supabase
    .from('meeting_action_items' as never)
    .delete()
    .eq('id' as never, id)
  if (error) return { ok: false, error: error.message }

  const meetingId = (row as { meeting_id?: string } | null)?.meeting_id
  if (meetingId) revalidatePath(`/meetings/${meetingId}`)
  return { ok: true }
}
