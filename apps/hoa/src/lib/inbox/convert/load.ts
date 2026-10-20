/**
 * BL-101 A4 — what the violation wizard starts from when it is opened
 * from an email (`/violations/new?from_thread=<thread id>`).
 *
 * Only the thread id travels in the URL; the email text is read here,
 * server-side, org-scoped on the board member's RLS client, and redacted
 * of contact details (convert/model.ts violationNotesFromEmail) before it
 * reaches the page. Never the service role. Logs: ids and codes only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { asUnitId, resolvePropertyForUnit } from '@/lib/properties/resolve'
import { violationNotesFromEmail } from './model'

type Db = SupabaseClient<Database>

export interface ViolationPrefill {
  threadId: string
  /** The thread's home (hoa_properties id), when it is filed under one. */
  propertyId: string | null
  notes: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Null when the id is not a thread in this org, or it can't be read. */
export async function loadViolationPrefill(db: Db, orgId: string, threadId: string | undefined): Promise<ViolationPrefill | null> {
  if (!threadId || !UUID.test(threadId)) return null
  const { data: thread, error } = await db
    .from('inbox_threads')
    .select('id, unit_id')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()
  if (error) {
    console.error('loadViolationPrefill: thread read failed', { orgId, threadId, code: error.code })
    return null
  }
  if (!thread) return null

  const { data: msg, error: msgError } = await db
    .from('inbox_messages')
    .select('stripped_text, body_text')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (msgError) {
    console.error('loadViolationPrefill: message read failed', { orgId, threadId, code: msgError.code })
  }

  let propertyId: string | null = null
  if (thread.unit_id) {
    try {
      propertyId = await resolvePropertyForUnit(db, orgId, asUnitId(thread.unit_id))
    } catch {
      // resolvePropertyForUnit logged it; the board picks the home.
    }
  }

  return {
    threadId: thread.id,
    propertyId,
    notes: violationNotesFromEmail(msg?.stripped_text || msg?.body_text || ''),
  }
}
