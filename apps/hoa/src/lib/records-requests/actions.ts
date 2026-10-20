'use server'

/**
 * BL-123 (3): owner records requests — the two writes.
 *
 *   createRecordsRequest       resident files "Request association records"
 *   markRecordsRequestFulfilled board closes it as fulfilled
 *
 * Both are inert until RECORDS_REQUESTS_LIVE (packages/db/src/records-requests.ts):
 * before migration 0066 the category is refused by the CHECK constraint
 * and records_due_at does not exist. With the flag off they return an
 * error before touching the database.
 *
 * A records request is a ticket (category 'records_request'), so it rides
 * the ticket conversation, the board's ticket notifications and RLS from
 * 0024. Nothing here sends anything to a resident. Logs carry codes only.
 *
 * records_due_at is the one column the resident's client does not write:
 * the service role sets it after the insert (see createRecordsRequest).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '@homeowner-portal/jobs'
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { associationTimeZone, todayIn } from '@/lib/association-time'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentUnits } from '@/lib/resident'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RECORDS_CATEGORY, RECORDS_NOT_LIVE, composeRecordsRequest, dueInstant, recordsDeadline } from './law'

type ActionErr = { ok: false; error: string; fieldErrors?: Record<string, string> }
export type RecordsActionResult<T = void> = (T extends void ? { ok: true } : { ok: true; data: T }) | ActionErr

function invalid(e: z.ZodError): ActionErr {
  const fieldErrors: Record<string, string> = {}
  for (const issue of e.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { ok: false, error: e.issues[0]?.message ?? 'Invalid input.', fieldErrors }
}

const CreateSchema = z.object({
  unitId: z.string().uuid('Pick a home.'),
  kind: z.enum(['owner_list', 'financial', 'minutes', 'contracts', 'governing', 'other'], {
    errorMap: () => ({ message: 'Choose which records.' }),
  }),
  period: z.enum(['current', 'prior', 'both'], { errorMap: () => ({ message: 'Choose which years.' }) }),
  format: z.enum(['inspect', 'electronic', 'paper'], { errorMap: () => ({ message: 'Choose a format.' }) }),
  details: z.string().trim().min(10, 'Say which records you need, in a sentence or two.').max(4000),
})

export type CreateRecordsRequestInput = z.input<typeof CreateSchema>

export async function createRecordsRequest(
  input: CreateRecordsRequestInput,
): Promise<RecordsActionResult<{ ticketId: string }>> {
  if (!RECORDS_REQUESTS_LIVE) return { ok: false, error: RECORDS_NOT_LIVE }

  const parsed = CreateSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  if ((await getResidentActor()).impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const unit = (await getResidentUnits()).find((u) => u.unit_id === parsed.data.unitId)
  if (!unit) return { ok: false, error: 'You can only send a request for a home you own.' }

  // The statutory clock starts on the association's day of receipt. A
  // failed state read files the request without a stored date (the board
  // view still works it out); it never blocks the owner.
  let state: string | null = null
  if (unit.association_id) {
    const { data, error } = await supabase
      .from('associations')
      .select('state')
      .eq('id', unit.association_id)
      .maybeSingle()
    if (error) console.error('[records-request] association state read failed', { code: error.code ?? null })
    state = (data as { state: string | null } | null)?.state ?? null
  }
  const receivedDay = todayIn(associationTimeZone({ state }))
  const deadline = recordsDeadline({ state, kind: parsed.data.kind, period: parsed.data.period, receivedDay })
  const { subject, description } = composeRecordsRequest(parsed.data)

  const { data: row, error } = await supabase
    .from('tickets' as never)
    .insert({
      organization_id: org.id,
      association_id: unit.association_id,
      unit_id: parsed.data.unitId,
      submitted_by: user.id,
      category: RECORDS_CATEGORY,
      subject,
      description,
      status: 'open',
    } as never)
    .select('id')
    .single<{ id: string }>()
  if (error || !row) {
    console.error('[records-request] insert failed', { code: error?.code ?? null })
    return { ok: false, error: 'Couldn’t send your request. Please try again.' }
  }

  // The due day is written with the service role, never by the resident's
  // own client: migration 0066's tickets_records_due_at_guard refuses
  // records_due_at from an authenticated non-board caller, so a resident
  // posting to PostgREST directly cannot pick their own deadline. Scoped to
  // the row just inserted (id + org + submitter + category, still unset). A
  // failure leaves the date NULL, which the board view works out itself;
  // it never blocks the owner.
  if (deadline.dueDate) {
    try {
      const { error: dueError } = await createAdminClient()
        .from('tickets' as never)
        .update({ records_due_at: dueInstant(deadline.dueDate) } as never)
        .eq('id', row.id)
        .eq('organization_id' as never, org.id)
        .eq('submitted_by' as never, user.id)
        .eq('category' as never, RECORDS_CATEGORY)
        .is('records_due_at' as never, null)
      if (dueError) console.error('[records-request] due date write failed', { code: dueError.code ?? null })
    } catch (err) {
      console.error(`[records-request] due date write threw for ticket ${row.id}`, {
        name: err instanceof Error ? err.name : 'unknown',
      })
    }
  }

  // Board notification, exactly as a support ticket (board members only).
  try {
    await inngest.send({ name: 'ticket/created', data: { ticketId: row.id, organizationId: org.id } })
  } catch (err) {
    console.error(`[records-request] could not queue board notification for ticket ${row.id}`, {
      name: err instanceof Error ? err.name : 'unknown',
    })
  }

  revalidatePath('/resident/requests')
  revalidatePath('/resident/tickets')
  revalidatePath('/tickets/records')
  return { ok: true, data: { ticketId: row.id } }
}

const FulfilSchema = z.object({
  ticketId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
})

/**
 * Close a records request as fulfilled, with an INTERNAL note (never shown
 * to the owner, never emailed). Telling the owner is the board's own reply
 * in the conversation.
 */
export async function markRecordsRequestFulfilled(input: {
  ticketId: string
  note?: string
}): Promise<RecordsActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!RECORDS_REQUESTS_LIVE) return { ok: false, error: RECORDS_NOT_LIVE }

  const parsed = FulfilSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data, error } = await supabase
    .from('tickets' as never)
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: user.id } as never)
    .eq('id', parsed.data.ticketId)
    .eq('organization_id' as never, gate.orgId)
    .eq('category' as never, RECORDS_CATEGORY)
    .is('deleted_at', null)
    .select('id')
  if (error) {
    console.error('[records-request] mark fulfilled failed', { code: error.code ?? null })
    return { ok: false, error: 'Couldn’t mark it fulfilled. Please try again.' }
  }
  if (!data || (data as unknown[]).length === 0) return { ok: false, error: 'That records request wasn’t found.' }

  const note = parsed.data.note ? `Marked fulfilled: ${parsed.data.note}` : 'Marked fulfilled.'
  const { error: noteError } = await supabase.from('ticket_messages' as never).insert({
    ticket_id: parsed.data.ticketId,
    author_id: user.id,
    author_role: 'board',
    body: note,
    internal: true,
  } as never)
  if (noteError) console.error('[records-request] fulfilled note failed', { code: noteError.code ?? null })

  revalidatePath('/tickets')
  revalidatePath('/tickets/records')
  revalidatePath(`/tickets/${parsed.data.ticketId}`)
  revalidatePath(`/resident/tickets/${parsed.data.ticketId}`)
  return { ok: true }
}
