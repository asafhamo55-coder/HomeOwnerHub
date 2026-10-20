/**
 * BL-101 A1 — context rail v2: who wrote, what they owe, what's open, what
 * was said before, and which governing-doc sections match.
 *
 * Every read is on the board member's own RLS client and carries an
 * explicit org filter (see the org-scoping note at the top of queries.ts).
 * Each section degrades on its own (`failed`), so one bad read never
 * blanks the rail and never reads as "none".
 *
 * Logs carry ids and error codes only.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { listThreadsForUnit, type PropertyContext, type ThreadDetail } from '@/lib/inbox/queries'
import { escapeLikePattern } from '@/lib/properties/resolve'
import {
  checkSenderForUnit,
  latestInboundSender,
  loadHomeAccount,
  type HomeAccount,
  type SenderCheck,
} from './account-context'

type Db = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any }

function logDbError(where: string, table: string, ids: Record<string, string | null>, error: PostgrestError | null) {
  console.error(`${where}: query on "${table}" failed`, { ...ids, code: error?.code ?? null })
}

export interface RailSender {
  check: SenderCheck
  /** The resident the sender is, when verified and on file. */
  resident: { id: string; name: string; role: string } | null
}

export type LinkedRecordType = 'ticket' | 'arc_request' | 'violation' | 'communication_thread'

export interface LinkedRecord {
  type: LinkedRecordType
  id: string
  label: string
  status: string
  href: string | null
}

export interface PastThread {
  id: string
  subject: string | null
  status: string
  lastMessageAt: string | null
  /** Why it is listed: same home, same sender, or both. */
  via: 'home' | 'sender' | 'both'
}

export interface RelevantDoc {
  refId: string
  label: string
  documentTitle: string | null
  /** True when the current draft quotes it. */
  cited: boolean
}

export interface ThreadRailContext {
  sender: RailSender
  /** Null when the thread is not filed under a home. */
  home: HomeAccount | null
  linked: { items: LinkedRecord[]; failed: boolean }
  pastThreads: { items: PastThread[]; failed: boolean }
  /** `drafted: false` = no reply draft yet, so no retrieval to show. */
  docs: { items: RelevantDoc[]; failed: boolean; drafted: boolean }
}

const PAST_THREAD_LIMIT = 6

export async function getThreadRailContext(
  db: Db,
  orgId: string,
  thread: Pick<ThreadDetail, 'id' | 'unitId' | 'messages'>,
  residents: PropertyContext['residents'] | null,
): Promise<ThreadRailContext> {
  const senderEmail = latestInboundSender(thread.messages)
  const [check, home, linked, pastThreads, docs, threadResidentId] = await Promise.all([
    checkSenderForUnit(db, orgId, thread.unitId, senderEmail, { threadId: thread.id }),
    thread.unitId ? loadHomeAccount(db, orgId, thread.unitId) : Promise.resolve(null),
    readLinkedRecords(db, orgId, thread.id),
    readPastThreads(db, orgId, thread.id, thread.unitId, senderEmail),
    readRelevantDocs(db, orgId, thread.id),
    readThreadResidentId(db, orgId, thread.id),
  ])

  let resident: RailSender['resident'] = null
  if (check.verified) {
    const id = check.residentId ?? threadResidentId
    const r = id ? residents?.find((x) => x.id === id) : undefined
    if (r) resident = { id: r.id, name: r.name, role: r.role }
  }

  return { sender: { check, resident }, home, linked, pastThreads, docs }
}

async function readThreadResidentId(db: Db, orgId: string, threadId: string): Promise<string | null> {
  const { data, error } = await db
    .from('inbox_threads')
    .select('resident_id')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()
  if (error) {
    logDbError('getThreadRailContext', 'inbox_threads', { orgId, threadId }, error)
    return null
  }
  return data?.resident_id ?? null
}

// ─── Linked records (inbox_thread_links) ────────────────────────────

/**
 * `inbox_thread_links.resource_id` has no FK. The writer now checks type
 * and org before writing (lib/inbox/links.ts writeThreadLink), but rows
 * written before that check — or by hand — are not trusted, so every id
 * is re-checked here too: it must exist, undeleted, in the table for its
 * type AND belong to this org. A link that fails either check is dropped,
 * never shown.
 */
export async function readLinkedRecords(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<ThreadRailContext['linked']> {
  const { data, error } = await db
    .from('inbox_thread_links')
    .select('resource_type, resource_id')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    logDbError('readLinkedRecords', 'inbox_thread_links', { orgId, threadId }, error)
    return { items: [], failed: true }
  }
  const idsOf = (type: LinkedRecordType) =>
    [...new Set((data ?? []).filter((l) => l.resource_type === type).map((l) => l.resource_id))]
  const ticketIds = idsOf('ticket')
  const arcIds = idsOf('arc_request')
  const violationIds = idsOf('violation')
  const commIds = idsOf('communication_thread')

  const loose = db as unknown as Loose
  const none = Promise.resolve({ data: [], error: null })
  const [tickets, arcs, violations, comms] = await Promise.all([
    ticketIds.length
      ? loose.from('tickets').select('id, subject, status, organization_id').eq('organization_id', orgId).in('id', ticketIds).is('deleted_at', null)
      : none,
    arcIds.length
      ? loose.from('arc_requests').select('id, summary, status, organization_id').eq('organization_id', orgId).in('id', arcIds).is('deleted_at', null)
      : none,
    violationIds.length
      ? loose.from('hoa_violations').select('id, violation_type, status, org_id').eq('org_id', orgId).in('id', violationIds).is('deleted_at', null)
      : none,
    commIds.length
      ? loose.from('communication_threads').select('id, topic_label, topic_category, status, root_communication_id, organization_id').eq('organization_id', orgId).in('id', commIds)
      : none,
  ])

  let failed = false
  const items: LinkedRecord[] = []
  const take = <T>(res: { data: T[] | null; error: PostgrestError | null }, table: string): T[] => {
    if (res.error) {
      logDbError('readLinkedRecords', table, { orgId, threadId }, res.error)
      failed = true
      return []
    }
    return res.data ?? []
  }
  for (const t of take<{ id: string; subject: string; status: string; organization_id: string }>(tickets, 'tickets')) {
    if (t.organization_id === orgId && ticketIds.includes(t.id)) items.push({ type: 'ticket', id: t.id, label: t.subject, status: t.status, href: `/tickets/${t.id}` })
  }
  for (const a of take<{ id: string; summary: string; status: string; organization_id: string }>(arcs, 'arc_requests')) {
    if (a.organization_id === orgId && arcIds.includes(a.id)) items.push({ type: 'arc_request', id: a.id, label: a.summary, status: a.status, href: `/arc/${a.id}` })
  }
  for (const v of take<{ id: string; violation_type: string; status: string; org_id: string }>(violations, 'hoa_violations')) {
    if (v.org_id === orgId && violationIds.includes(v.id))
      items.push({ type: 'violation', id: v.id, label: v.violation_type.replace(/_/g, ' '), status: v.status, href: `/violations/${v.id}` })
  }
  for (const c of take<{
    id: string
    topic_label: string | null
    topic_category: string
    status: string
    root_communication_id: string | null
    organization_id: string
  }>(comms, 'communication_threads')) {
    if (c.organization_id === orgId && commIds.includes(c.id))
      items.push({
        type: 'communication_thread',
        id: c.id,
        label: c.topic_label ?? c.topic_category.replace(/_/g, ' '),
        status: c.status,
        href: c.root_communication_id ? `/communications/${c.root_communication_id}` : null,
      })
  }
  return { items, failed }
}

// ─── Past threads (this home, this sender) ──────────────────────────

/** Same filing rule as the inbox list: threads filed or trashed in Gmail stay hidden. */
const HIDDEN_STATES_SQL = '("archived","trashed")'

export async function readPastThreads(
  db: Db,
  orgId: string,
  threadId: string,
  unitId: string | null,
  senderEmail: string | null,
): Promise<ThreadRailContext['pastThreads']> {
  let failed = false
  const byId = new Map<string, PastThread>()

  if (unitId) {
    try {
      for (const t of await listThreadsForUnit(db, orgId, unitId, PAST_THREAD_LIMIT + 1)) {
        if (t.id !== threadId) byId.set(t.id, { ...t, via: 'home' })
      }
    } catch {
      // listThreadsForUnit already logged ids + message.
      failed = true
    }
  }

  if (senderEmail) {
    const { data: msgs, error: msgError } = await db
      .from('inbox_messages')
      .select('thread_id')
      .eq('organization_id', orgId)
      .eq('direction', 'inbound')
      .ilike('from_email', escapeLikePattern(senderEmail))
      .neq('thread_id', threadId)
      .order('sent_at', { ascending: false })
      .limit(50)
    if (msgError) {
      logDbError('readPastThreads', 'inbox_messages', { orgId, threadId }, msgError)
      failed = true
    } else {
      const ids = [...new Set((msgs ?? []).map((m) => m.thread_id))].slice(0, PAST_THREAD_LIMIT)
      if (ids.length > 0) {
        const { data: rows, error } = await db
          .from('inbox_threads')
          .select('id, subject, status, last_message_at')
          .eq('organization_id', orgId)
          .in('id', ids)
          .not('gmail_state', 'in', HIDDEN_STATES_SQL)
        if (error) {
          logDbError('readPastThreads', 'inbox_threads', { orgId, threadId }, error)
          failed = true
        } else {
          for (const r of rows ?? []) {
            const prior = byId.get(r.id)
            byId.set(r.id, {
              id: r.id,
              subject: r.subject,
              status: r.status,
              lastMessageAt: r.last_message_at,
              via: prior ? 'both' : 'sender',
            })
          }
        }
      }
    }
  }

  const items = [...byId.values()]
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
    .slice(0, PAST_THREAD_LIMIT)
  return { items, failed }
}

// ─── Relevant governing-doc sections ────────────────────────────────

/**
 * The governing-doc sections the last reply draft's retrieval found (W1's
 * hits), read back from that draft's ai_runs input — the exact set W32 was
 * allowed to cite — so the rail costs no model call. The document title is
 * re-read org-scoped from the chunk, not trusted from the run.
 */
export async function readRelevantDocs(db: Db, orgId: string, threadId: string): Promise<ThreadRailContext['docs']> {
  const { data: draft, error: draftError } = await db
    .from('inbox_drafts')
    .select('ai_run_id, citations')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .eq('kind', 'reply')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draftError) {
    logDbError('readRelevantDocs', 'inbox_drafts', { orgId, threadId }, draftError)
    return { items: [], failed: true, drafted: false }
  }
  if (!draft?.ai_run_id) return { items: [], failed: false, drafted: Boolean(draft) }

  const { data: run, error: runError } = await db
    .from('ai_runs')
    .select('input')
    .eq('organization_id', orgId)
    .eq('id', draft.ai_run_id)
    .maybeSingle()
  if (runError) {
    logDbError('readRelevantDocs', 'ai_runs', { orgId, threadId }, runError)
    return { items: [], failed: true, drafted: true }
  }

  const fragments = docFragmentsOf(run?.input)
  if (fragments.length === 0) return { items: [], failed: false, drafted: true }

  const cited = new Set(
    (Array.isArray(draft.citations) ? (draft.citations as Array<{ refId?: unknown }>) : [])
      .map((c) => (typeof c?.refId === 'string' ? c.refId : null))
      .filter((x): x is string => x !== null),
  )

  const chunkIds = fragments.map((f) => f.refId.slice('doc:'.length))
  const { data: chunks, error: chunkError } = await db
    .from('governing_document_chunks')
    .select('id, document_id')
    .eq('organization_id', orgId)
    .in('id', chunkIds)
  if (chunkError) {
    logDbError('readRelevantDocs', 'governing_document_chunks', { orgId, threadId }, chunkError)
    return { items: [], failed: true, drafted: true }
  }
  const docIdByChunk = new Map((chunks ?? []).map((c) => [c.id, c.document_id]))
  const docIds = [...new Set(docIdByChunk.values())]
  const titles = new Map<string, string>()
  let failed = false
  if (docIds.length > 0) {
    const { data: docs, error: docError } = await db
      .from('governing_documents')
      .select('id, title')
      .eq('organization_id', orgId)
      .in('id', docIds)
    if (docError) {
      logDbError('readRelevantDocs', 'governing_documents', { orgId, threadId }, docError)
      failed = true
    } else {
      for (const d of docs ?? []) titles.set(d.id, d.title)
    }
  }

  // A chunk that no longer exists in this org is dropped, not shown.
  const items: RelevantDoc[] = fragments
    .filter((f) => docIdByChunk.has(f.refId.slice(4)))
    .map((f) => ({
      refId: f.refId,
      label: f.label,
      documentTitle: titles.get(docIdByChunk.get(f.refId.slice(4))!) ?? null,
      cited: cited.has(f.refId),
    }))
    .sort((a, b) => Number(b.cited) - Number(a.cited))
  return { items, failed, drafted: true }
}

/** The `doc:` fragments of a W32 ai_runs input, defensively parsed. */
export function docFragmentsOf(input: unknown): Array<{ refId: string; label: string }> {
  const raw = (input as { fragments?: unknown } | null)?.fragments
  if (!Array.isArray(raw)) return []
  const out: Array<{ refId: string; label: string }> = []
  const seen = new Set<string>()
  for (const f of raw) {
    const refId = (f as { refId?: unknown })?.refId
    const label = (f as { label?: unknown })?.label
    const type = (f as { sourceType?: unknown })?.sourceType
    if (typeof refId !== 'string' || !refId.startsWith('doc:') || type !== 'document') continue
    if (seen.has(refId)) continue
    seen.add(refId)
    out.push({ refId, label: typeof label === 'string' ? label : 'Governing document' })
  }
  return out
}
