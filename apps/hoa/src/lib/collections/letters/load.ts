import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEstoppelInput } from '@/lib/properties/estoppel/load'
import type { PropertyId } from '@/lib/properties/resolve'
import { listEventsForCase } from '../queries'
import type { CollectionStatus } from '../statuses'
import { LETTER_AUDIT_ENTITY, LETTER_PRINTED } from './audit'
import type { LetterEvent, LetterInput } from './model'
import { LETTER_ACTION, readLetterPayload, type LetterPayload } from './proposal'

/**
 * Everything the collections letter page needs (BL-089), read with the
 * caller's cookie-bound client so RLS applies (collection_*, approval_
 * requests and audit_log are all board/admin only). The ledger, owners
 * and association come from the estoppel loader, which throws on any
 * failed read and refuses a truncated ledger; the same here.
 */

export interface LetterRequest {
  id: string
  status: string
  proposedAt: string
  decisionReason: string | null
  error: string | null
  payload: LetterPayload
  /** When it was first printed, or null. */
  printedAt: string | null
}

export interface LetterContext {
  input: LetterInput
  today: string
  collectionCase: { id: string; status: CollectionStatus } | null
  events: LetterEvent[]
  /** This case's letters, newest first (any status). */
  requests: LetterRequest[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }

export async function loadLetterContext(supabase: SupabaseClient, orgId: string, propertyId: PropertyId): Promise<LetterContext | null> {
  const ctx = await loadEstoppelInput(supabase, orgId, propertyId)
  if (!ctx) return null
  const live = ctx.input.collectionCase
  const base = { input: ctx.input, today: ctx.today, collectionCase: live ? { id: live.id, status: live.status } : null }
  if (!live) return { ...base, events: [], requests: [] }

  const db = supabase as unknown as Loose
  const [events, reqRes] = await Promise.all([
    listEventsForCase(supabase, live.id, 500),
    db
      .from('approval_requests')
      .select('id, status, proposed_at, decision_reason, error, payload')
      .eq('organization_id', orgId)
      .eq('action_type', LETTER_ACTION)
      .eq('payload->>caseId', live.id)
      .order('proposed_at', { ascending: false })
      .limit(20) as Promise<{ data: Array<Record<string, unknown>> | null; error: { code?: string } | null }>,
  ])
  if (reqRes.error) throw new Error(`collections letters: approvals read failed (${reqRes.error.code ?? 'no code'})`)

  const rows = (reqRes.data ?? []).flatMap((r) => {
    const payload = readLetterPayload(r.payload)
    return payload
      ? [{ id: String(r.id), status: String(r.status), proposedAt: String(r.proposed_at), decisionReason: (r.decision_reason as string | null) ?? null, error: (r.error as string | null) ?? null, payload }]
      : []
  })

  const printed = new Map<string, string>()
  if (rows.length > 0) {
    const auditRes = (await db
      .from('audit_log')
      .select('entity_id, created_at')
      .eq('org_id', orgId)
      .eq('action', LETTER_PRINTED)
      .eq('entity_type', LETTER_AUDIT_ENTITY)
      .in(
        'entity_id',
        rows.map((r) => r.id),
      )
      .order('created_at', { ascending: true })) as { data: Array<{ entity_id: string; created_at: string }> | null; error: { code?: string } | null }
    if (auditRes.error) throw new Error(`collections letters: print log read failed (${auditRes.error.code ?? 'no code'})`)
    for (const a of auditRes.data ?? []) if (!printed.has(a.entity_id)) printed.set(a.entity_id, a.created_at)
  }

  return {
    ...base,
    events: events.map((e) => ({ eventType: e.eventType, occurredOn: e.occurredOn })),
    requests: rows.map((r) => ({ ...r, printedAt: printed.get(r.id) ?? null })),
  }
}
