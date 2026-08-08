/**
 * Resolving the link between a resident thread and the vendor thread a work
 * order started.
 *
 * A vendor request is threadless when drafted (`thread_id` NULL) and only
 * becomes a real thread when the ordinary 2-minute sync ingests the sent
 * message. So neither direction can be a foreign key — the target does not
 * exist yet at write time. Both directions instead resolve through the pair
 * the draft already records:
 *
 *   inbox_drafts.source_thread_id   → which resident thread it came from
 *   inbox_drafts.gmail_message_id   → the message the sync will ingest
 *
 * A sent message and its synced copy share a `gmail_message_id`, so joining
 * on it finds the thread the request landed in. That is the same mechanism
 * getThreadDetail already uses to badge a forwarded message; this reuses it
 * rather than adding a second source of truth.
 *
 * Deliberately NOT `inbox_thread_links`: that table's `resource_id` has no
 * foreign key to anything and carries a documented dangling-UUID hazard
 * (lib/inbox/actions.ts:379).
 *
 * Never log an email address, subject, or body.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient<never>

export interface OutgoingVendorRequest {
  draftId: string
  /** Who it went to. Rendered as-is; these are vendor business addresses. */
  toEmails: string[]
  status: string
  /**
   * The vendor thread, once the sync has ingested the sent message. Null
   * while the request is still drafting, queued, or within the ~2-minute
   * sync lag — the UI shows "Sending…" rather than a dead link.
   */
  vendorThreadId: string | null
}

export interface IncomingVendorRequest {
  sourceThreadId: string
  sourceSubject: string | null
}

/**
 * Vendor requests sent FROM this resident thread.
 *
 * Returns `[]` on a failed read rather than throwing: this is a
 * cross-reference in a header, and a missing link is cosmetic where an
 * unrenderable thread is not. Same stakes split getThreadDetail uses for its
 * own enrichment reads.
 */
export async function getOutgoingVendorRequests(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<OutgoingVendorRequest[]> {
  const { data: drafts, error } = await db
    .from('inbox_drafts')
    .select('id, to_emails, status, gmail_message_id')
    .eq('organization_id', orgId)
    .eq('source_thread_id', threadId)
    .eq('kind', 'vendor_request')
    .order('created_at', { ascending: false })
    .returns<
      Array<{
        id: string
        to_emails: string[] | null
        status: string
        gmail_message_id: string | null
      }>
    >()

  if (error) {
    console.error(`getOutgoingVendorRequests: read failed: ${error.code} ${error.message}`)
    return []
  }
  if (!drafts || drafts.length === 0) return []

  const threadByMessageId = await resolveThreadsForMessages(
    db,
    orgId,
    drafts.map((d) => d.gmail_message_id).filter((id): id is string => Boolean(id)),
  )

  return drafts.map((draft) => ({
    draftId: draft.id,
    toEmails: draft.to_emails ?? [],
    status: draft.status,
    vendorThreadId: draft.gmail_message_id
      ? (threadByMessageId.get(draft.gmail_message_id) ?? null)
      : null,
  }))
}

/**
 * The resident thread a vendor thread came from, when it came from one.
 *
 * Runs the join in reverse: this thread's message ids → the draft that sent
 * one of them → that draft's `source_thread_id`.
 */
export async function getIncomingVendorRequest(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<IncomingVendorRequest | null> {
  // No `.not(gmail_message_id, is, null)` filter: the column is NOT NULL in
  // the schema, so the guard would be redundant — and it also erases the
  // `.returns<>` generic, which is how it announced itself.
  const { data: messages, error: messagesError } = await db
    .from('inbox_messages')
    .select('gmail_message_id')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .returns<Array<{ gmail_message_id: string | null }>>()

  if (messagesError) {
    console.error(
      `getIncomingVendorRequest: messages read failed: ${messagesError.code} ${messagesError.message}`,
    )
    return null
  }

  const messageIds = (messages ?? [])
    .map((m) => m.gmail_message_id)
    .filter((id): id is string => Boolean(id))
  if (messageIds.length === 0) return null

  const { data: draft, error: draftError } = await db
    .from('inbox_drafts')
    .select('source_thread_id')
    .eq('organization_id', orgId)
    .eq('kind', 'vendor_request')
    .in('gmail_message_id', messageIds)
    .not('source_thread_id', 'is', null)
    .limit(1)
    .maybeSingle<{ source_thread_id: string | null }>()

  if (draftError) {
    console.error(
      `getIncomingVendorRequest: draft read failed: ${draftError.code} ${draftError.message}`,
    )
    return null
  }
  if (!draft?.source_thread_id) return null

  // Re-scoped to the org rather than trusted: source_thread_id is a real FK,
  // but a FK only proves the row exists somewhere, not that it belongs to
  // this tenant — the exact hazard linkThreadToResource was patched for.
  const { data: source, error: sourceError } = await db
    .from('inbox_threads')
    .select('id, subject')
    .eq('organization_id', orgId)
    .eq('id', draft.source_thread_id)
    .maybeSingle<{ id: string; subject: string | null }>()

  if (sourceError) {
    console.error(
      `getIncomingVendorRequest: thread read failed: ${sourceError.code} ${sourceError.message}`,
    )
    return null
  }
  if (!source) return null

  return { sourceThreadId: source.id, sourceSubject: source.subject }
}

/** gmail_message_id → the thread the sync ingested that message into. */
async function resolveThreadsForMessages(
  db: Db,
  orgId: string,
  gmailMessageIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (gmailMessageIds.length === 0) return map

  const { data, error } = await db
    .from('inbox_messages')
    .select('gmail_message_id, thread_id')
    .eq('organization_id', orgId)
    .in('gmail_message_id', gmailMessageIds)
    .returns<Array<{ gmail_message_id: string | null; thread_id: string }>>()

  if (error) {
    console.error(`resolveThreadsForMessages: read failed: ${error.code} ${error.message}`)
    return map
  }

  for (const row of data ?? []) {
    if (row.gmail_message_id) map.set(row.gmail_message_id, row.thread_id)
  }
  return map
}
