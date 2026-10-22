import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEstoppelInput } from '@/lib/properties/estoppel/load'
import { readAll } from '@/lib/supabase/read-all'
import type { PropertyId } from '@/lib/properties/resolve'
import { listEventsForCase } from '../queries'
import type { CollectionStatus } from '../statuses'
import { LETTER_AUDIT_ENTITY, LETTER_PRINTED } from './audit'
import type { LetterEvent, LetterInput } from './model'
import { loadGaRegistrationGate } from '@/lib/ga-registration/load'
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
type QueryError = { code?: string; message?: string }
type Page<T> = PromiseLike<{ data: T[] | null; error: QueryError | null }>

const IN_CHUNK = 100
const failed = (what: string) => (e: QueryError) => new Error(`collections letters: ${what} read failed (${e.code ?? 'no code'})`)

export async function loadLetterContext(supabase: SupabaseClient, orgId: string, propertyId: PropertyId): Promise<LetterContext | null> {
  const ctx = await loadEstoppelInput(supabase, orgId, propertyId)
  if (!ctx) return null
  const live = ctx.input.collectionCase
  // BL-149: a Georgia association's SB 406 registration, verified here on
  // the server; the letter's state law check reads the status. A failed
  // read throws like every other read here (the page says so).
  let gaRegistration: LetterInput['gaRegistration']
  if (ctx.input.state === 'GA' && ctx.associationId) {
    const reg = await loadGaRegistrationGate(supabase as never, orgId, ctx.today, ctx.associationId)
    if (!reg.ok) throw new Error('collections letters: registration read failed')
    gaRegistration = reg.standing ? { status: reg.standing.status } : undefined
  }
  const input = gaRegistration ? { ...ctx.input, gaRegistration } : ctx.input
  const base = { input, today: ctx.today, collectionCase: live ? { id: live.id, status: live.status } : null }
  if (!live) return { ...base, events: [], requests: [] }

  const db = supabase as unknown as Loose
  // EVERY letter on the case, paged past the row cap: a newest-N window
  // could hide an approved letter that hasn't been printed yet.
  const [events, reqRows] = await Promise.all([
    listEventsForCase(supabase, live.id, 500),
    readAll<Record<string, unknown>>(
      (from, to) =>
        db
          .from('approval_requests')
          .select('id, status, proposed_at, decision_reason, error, payload')
          .eq('organization_id', orgId)
          .eq('action_type', LETTER_ACTION)
          .eq('payload->>caseId', live.id)
          .order('proposed_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as Page<Record<string, unknown>>,
      failed('approvals'),
    ),
  ])

  const rows = reqRows.flatMap((r) => {
    const payload = readLetterPayload(r.payload)
    return payload
      ? [{ id: String(r.id), status: String(r.status), proposedAt: String(r.proposed_at), decisionReason: (r.decision_reason as string | null) ?? null, error: (r.error as string | null) ?? null, payload }]
      : []
  })

  // The first print of each letter, read in chunks of ids.
  const printed = new Map<string, string>()
  const audits: Array<{ entity_id: string; created_at: string }> = []
  for (let i = 0; i < rows.length; i += IN_CHUNK) {
    const ids = rows.slice(i, i + IN_CHUNK).map((r) => r.id)
    audits.push(
      ...(await readAll<{ entity_id: string; created_at: string }>(
        (from, to) =>
          db
            .from('audit_log')
            .select('entity_id, created_at')
            .eq('org_id', orgId)
            .eq('action', LETTER_PRINTED)
            .eq('entity_type', LETTER_AUDIT_ENTITY)
            .in('entity_id', ids)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to) as Page<{ entity_id: string; created_at: string }>,
        failed('print log'),
      )),
    )
  }
  audits.sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const a of audits) if (!printed.has(a.entity_id)) printed.set(a.entity_id, a.created_at)

  return {
    ...base,
    events: events.map((e) => ({ eventType: e.eventType, occurredOn: e.occurredOn })),
    requests: rows.map((r) => ({ ...r, printedAt: printed.get(r.id) ?? null })),
  }
}
