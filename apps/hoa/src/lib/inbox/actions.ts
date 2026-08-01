'use server'

/**
 * Triage actions for the shared HOA inbox: assign a thread to a property,
 * change its status, link it to an existing record, and search properties
 * for the assignment control.
 *
 * `assignThreadToProperty` is the highest-value function in this file. It
 * does two things beyond filing the thread:
 *   1. Sets match_source = 'manual', which is the exact flag applyMatch()
 *      (apps/hoa/src/lib/inbox/match.ts) checks before it will touch a
 *      thread again — a manager's assignment survives every future sync.
 *   2. When asked to "remember sender", it upserts inbox_sender_aliases so
 *      the NEXT email from that address matches at HIGH confidence
 *      automatically. That table is the matcher's entire learning loop —
 *      it is why the needs-review queue shrinks over time instead of
 *      holding steady.
 *
 * Error handling: every Supabase read/write below destructures `error`
 * and checks it explicitly, matching the pattern in
 * apps/hoa/src/lib/inbox/queries.ts and match.ts. A soft PostgREST
 * failure returns `{ data: null, error }` WITHOUT throwing — an unchecked
 * read/write here would let a server action report success while nothing
 * was actually written, which is worse than an unchecked read on a page
 * (the manager acts on the belief that the thread is filed). Same
 * stakes-based split as queries.ts: the primary mutation (the thread
 * update itself) fails the whole action on error; the alias write and the
 * "who sent the first message" lookup are enrichment on top of an
 * already-successful primary action, so a failure there is logged (for
 * diagnosis — the learning loop silently not improving is a real
 * regression) but does not turn a successful filing into a reported
 * failure.
 *
 * Authorization: every inbox RLS policy requires
 * public.auth_is_board_or_admin(organization_id) (migration 0029). These
 * actions run on the user-scoped Supabase client, so RLS is a genuine
 * backstop, but requireBoardOrAdmin() still gates every export here —
 * failing fast in app code beats a query RLS silently filters to zero
 * rows, which would otherwise look identical to "thread not found".
 *
 * Org scoping: every mutation is scoped to requireBoardOrAdmin()'s
 * session-derived org, never to anything read out of the form. A
 * `threadId` arriving in FormData is user input; `.eq('organization_id',
 * org.id)` on every read/update is what keeps a stale or crafted id from
 * touching another tenant's row. The two UPDATEs additionally re-select
 * the row after writing so a threadId that doesn't resolve inside the
 * caller's org (already excluded by the org filter, so this matches zero
 * rows) is reported as an error instead of a false "ok: true" — the same
 * "looks like it worked, nothing happened" failure mode the PII/error
 * rule above exists to prevent.
 *
 * PII: never log an email address, subject, or body. Only ids and
 * Postgres error codes/messages.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { PostgrestError } from '@supabase/supabase-js'
import type { Json } from '@homeowner-portal/db/types'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { escapeLikePattern } from '@/lib/properties/resolve'

export interface InboxActionState {
  error?: string
  ok?: boolean
}

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: PostgrestError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: error.code,
    message: error.message,
  })
}

// ─── Assign ──────────────────────────────────────────────────────────

const AssignSchema = z.object({
  threadId: z.string().uuid(),
  unitId: z.string().uuid(),
  rememberSender: z.coerce.boolean().optional(),
})

/**
 * File a thread against a property by hand.
 *
 * See the module docstring for why match_source = 'manual' and the
 * sender-alias upsert are the two effects that matter here.
 */
export async function assignThreadToProperty(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const { org } = await requireBoardOrAdmin()

  const parsed = AssignSchema.safeParse({
    threadId: formData.get('threadId'),
    unitId: formData.get('unitId'),
    rememberSender: formData.get('rememberSender'),
  })
  if (!parsed.success) return { error: 'Pick a property to file this under.' }

  const { threadId, unitId, rememberSender } = parsed.data
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const reason: Record<string, unknown> = {
    rule: 'manual_assignment',
    matched_on: user.id,
  }

  const { data: updated, error } = await supabase
    .from('inbox_threads')
    .update({
      unit_id: unitId,
      match_confidence: 'high',
      match_source: 'manual',
      match_reason: reason as unknown as Json,
      status: 'open',
    })
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    logDbError('assignThreadToProperty', 'inbox_threads', { orgId: org.id, threadId }, error)
    return { error: 'Could not assign this thread. Try again.' }
  }
  if (!updated) {
    // Zero rows matched — either the thread doesn't exist or it isn't in
    // this org. Report it rather than a false "ok: true"; see module
    // docstring on org scoping.
    return { error: 'Thread not found.' }
  }

  if (rememberSender) {
    const { data: message, error: messageError } = await supabase
      .from('inbox_messages')
      .select('from_email')
      .eq('thread_id', threadId)
      .eq('organization_id', org.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (messageError) {
      // Enrichment only — the assignment itself already succeeded above.
      // Log so a broken learning loop is diagnosable, but don't turn a
      // successful filing into a reported failure.
      logDbError(
        'assignThreadToProperty',
        'inbox_messages',
        { orgId: org.id, threadId },
        messageError,
      )
    } else if (message?.from_email) {
      // Atomic upsert on the (organization_id, lower(email_address))
      // unique index (materialized as the generated column
      // email_address_lower — see migrations/0033_inbox_sender_alias_uniq.sql
      // for why: PostgREST's on_conflict parameter cannot target an
      // expression index directly). This is what keeps two managers
      // assigning the same sender concurrently from racing two inserts —
      // the second write merges into the first via ON CONFLICT DO UPDATE
      // instead of erroring or duplicating.
      const { error: aliasError } = await supabase.from('inbox_sender_aliases').upsert(
        {
          organization_id: org.id,
          email_address: message.from_email.trim().toLowerCase(),
          unit_id: unitId,
          source: 'manual',
          created_by: user.id,
        },
        { onConflict: 'organization_id,email_address_lower' },
      )

      if (aliasError) {
        logDbError(
          'assignThreadToProperty',
          'inbox_sender_aliases',
          { orgId: org.id, threadId },
          aliasError,
        )
      }
    }
  }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

// ─── Status ──────────────────────────────────────────────────────────

const StatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(['needs_review', 'open', 'waiting', 'closed']),
})

export async function setThreadStatus(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const { org } = await requireBoardOrAdmin()

  const parsed = StatusSchema.safeParse({
    threadId: formData.get('threadId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'Invalid status.' }

  const supabase = await getSupabaseServerClient()
  const { data: updated, error } = await supabase
    .from('inbox_threads')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle()

  if (error) {
    logDbError(
      'setThreadStatus',
      'inbox_threads',
      { orgId: org.id, threadId: parsed.data.threadId },
      error,
    )
    return { error: 'Could not update status. Try again.' }
  }
  if (!updated) return { error: 'Thread not found.' }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${parsed.data.threadId}`)
  return { ok: true }
}

// ─── Link ────────────────────────────────────────────────────────────

const LinkSchema = z.object({
  threadId: z.string().uuid(),
  resourceType: z.enum(['ticket', 'arc_request', 'violation', 'communication_thread']),
  resourceId: z.string().uuid(),
})

export async function linkThreadToResource(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const { org } = await requireBoardOrAdmin()

  const parsed = LinkSchema.safeParse({
    threadId: formData.get('threadId'),
    resourceType: formData.get('resourceType'),
    resourceId: formData.get('resourceId'),
  })
  if (!parsed.success) return { error: 'Invalid link target.' }

  const { threadId, resourceType, resourceId } = parsed.data
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Confirm the thread belongs to this org before creating a link row.
  // Without this, a crafted/stale threadId from the form would create an
  // inbox_thread_links row stamped with THIS org's organization_id but
  // pointing at another tenant's thread_id — the FK only requires the
  // thread to exist somewhere, not that it belongs to the caller's org.
  const { data: thread, error: threadError } = await supabase
    .from('inbox_threads')
    .select('id')
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (threadError) {
    logDbError('linkThreadToResource', 'inbox_threads', { orgId: org.id, threadId }, threadError)
    return { error: 'Could not link this thread. Try again.' }
  }
  if (!thread) return { error: 'Thread not found.' }

  const { error } = await supabase.from('inbox_thread_links').upsert(
    {
      organization_id: org.id,
      thread_id: threadId,
      resource_type: resourceType,
      resource_id: resourceId,
      created_by: user.id,
    },
    { onConflict: 'thread_id,resource_type,resource_id', ignoreDuplicates: true },
  )

  if (error) {
    logDbError('linkThreadToResource', 'inbox_thread_links', { orgId: org.id, threadId }, error)
    return { error: 'Could not link this thread. Try again.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

// ─── Property search ─────────────────────────────────────────────────

/**
 * Property search for the triage assignment control. Reads the org from
 * the session, like every other action in this file — takes only a
 * search term.
 */
export async function searchProperties(
  term: string,
): Promise<Array<{ unitId: string; address: string }>> {
  const { org } = await requireBoardOrAdmin()

  const trimmed = term.trim()
  if (!trimmed) return []

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('organization_id', org.id)
    .ilike('address_line1', `%${escapeLikePattern(trimmed)}%`)
    .order('address_line1')
    .limit(20)

  if (error) {
    logDbError('searchProperties', 'units', { orgId: org.id }, error)
    return []
  }

  return (data ?? []).map((unit) => ({
    unitId: unit.id,
    address: unit.unit_number
      ? `${unit.address_line1} #${unit.unit_number}`
      : unit.address_line1,
  }))
}
