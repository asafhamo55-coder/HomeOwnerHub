import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { queryGoverningDocs, askStateLaw } from '@homeowner-portal/workflows'
import { getThreadDetail, getPropertyContext, type PropertyContext } from '@/lib/inbox/queries'
import { findSimilarReplies } from './past-replies'

export interface RetrievedFragment {
  refId: string
  sourceType: 'document' | 'statute' | 'property' | 'past_reply'
  label: string
  text: string
}

export interface SourceResults {
  docs: { citations: Array<{ chunkId: string; label: string; text: string }> }
  statutes: { citations: Array<{ chunkId: string; label: string; text: string }> }
  property: { summary: string } | null
  pastReplies: Array<{ messageId: string; subject: string | null; body: string }>
  degraded: string[]
}

export interface ThreadRetrieval {
  threadSubject: string | null
  messages: Array<{
    direction: 'inbound' | 'outbound'
    from: string
    sentAt: string | null
    text: string
  }>
  latestInbound: string | null
  fragments: RetrievedFragment[]
  degraded: string[]
  hasProperty: boolean
  /**
   * W1's and W30's own synthesized answers, kept for background context only
   * — NOT surfaced as a fragment and NOT given a refId. `fragments` now
   * carries each citation's actual chunk text (see `fetchGoverningDocChunkTexts`
   * / `fetchStatuteChunkTexts` below), so a reviewer can check a quote
   * against its source. These two strings are the opposite of that: the
   * model's paraphrase of what the docs/statutes said, useful for orienting
   * the drafting step, but never something the composer should present next
   * to a citation label as if it were the document's own words.
   */
  aiContext: {
    governingDocs: string | null
    stateLaw: string | null
  }
}

/**
 * Flatten every source into one citable list.
 *
 * refIds are prefixed by source type because W1 and W30 both return chunk
 * ids from their own corpora and those id spaces can collide. A collision
 * would let a draft cite "c1" and have the validator match the wrong text —
 * a citation that looks verified but points somewhere else, which is worse
 * than no citation at all.
 *
 * Exported separately from retrieveForThread so it can be tested without a
 * database or four network calls.
 */
export function collectFragments(sources: SourceResults): {
  fragments: RetrievedFragment[]
  degraded: string[]
} {
  const fragments: RetrievedFragment[] = []

  for (const c of sources.docs.citations) {
    fragments.push({
      refId: `doc:${c.chunkId}`,
      sourceType: 'document',
      label: c.label,
      text: c.text,
    })
  }
  for (const c of sources.statutes.citations) {
    fragments.push({
      refId: `law:${c.chunkId}`,
      sourceType: 'statute',
      label: c.label,
      text: c.text,
    })
  }
  if (sources.property) {
    fragments.push({
      refId: 'prop:context',
      sourceType: 'property',
      label: 'Property record',
      text: sources.property.summary,
    })
  }
  for (const r of sources.pastReplies) {
    fragments.push({
      refId: `reply:${r.messageId}`,
      sourceType: 'past_reply',
      label: r.subject ? `Past reply — ${r.subject}` : 'Past reply',
      text: r.body,
    })
  }

  return { fragments, degraded: sources.degraded }
}

// ─── State resolution for W30 ───────────────────────────────────────────

type SupportedState = 'GA' | 'FL' | 'CA' | 'TX'
const SUPPORTED_STATES: readonly SupportedState[] = ['GA', 'FL', 'CA', 'TX']

/**
 * Resolve the org's governing-law state for a W30 (askStateLaw) call.
 *
 * The brief assumed `askStateLaw(question, ctx)` — a two-arg call. The real
 * signature is `askStateLaw(question, state, ctx)` (packages/workflows/src/
 * W30-state-law-brain/index.ts:152): state is required and is NOT derivable
 * from orgId alone. It lives on `associations.state` (an org can have more
 * than one association), not on `orgs`. The existing session-bound helper
 * `getAssociationState()` (apps/hoa/src/lib/state-law.ts:79) can't be reused
 * here — it depends on `getSupabaseServerClient()`/cookies, but
 * `retrieveForThread` takes an explicit `db` client so it can run from a
 * service-role/background context. This mirrors `getPrimaryAssociation()`'s
 * selection (apps/hoa/src/lib/vendors.ts:79: order by name, take the first)
 * against the passed-in `db`/`orgId` instead.
 *
 * A lookup failure or an unsupported/unset state both mean "no statute
 * grounding available for this org" — soft-degrade to null rather than
 * throwing, the same posture W1's `hasGoverningDocs` takes for its own
 * existence check.
 */
async function resolveAssociationState(
  db: SupabaseClient<Database>,
  orgId: string,
): Promise<SupportedState | null> {
  const { data, error } = await db
    .from('associations')
    .select('state')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(
      `retrieveForThread: association state lookup failed: ${error.code} ${error.message}`,
    )
    return null
  }
  const state = data?.state
  return state && (SUPPORTED_STATES as readonly string[]).includes(state)
    ? (state as SupportedState)
    : null
}

/**
 * Fetch each governing-doc chunk's own text by id, scoped to the org.
 *
 * W1's public output (`GoverningDocsCitation`) carries per-citation METADATA
 * only (chunkId/documentId/docType/section) — no chunk text. Fetching it
 * directly from `governing_document_chunks` is what makes each fragment's
 * `text` the document's own words rather than the model's paraphrase of
 * them. `organization_id` is filtered here, not just trusted from the
 * caller: these are one association's private governing documents, and a
 * chunk id alone does not prove it belongs to `orgId`.
 *
 * Soft-fails like every other read in this module: a failed query returns
 * `failed: true` and an empty map rather than throwing, so one source's
 * outage degrades the draft instead of losing it entirely.
 */
export async function fetchGoverningDocChunkTexts(
  db: SupabaseClient<Database>,
  orgId: string,
  chunkIds: string[],
): Promise<{ texts: Map<string, string>; failed: boolean }> {
  if (chunkIds.length === 0) return { texts: new Map(), failed: false }

  const { data, error } = await db
    .from('governing_document_chunks')
    .select('id, text')
    .eq('organization_id', orgId)
    .in('id', chunkIds)

  if (error) {
    // Never log .details — it can echo row/document contents.
    console.error(
      `retrieveForThread: governing doc chunk text fetch failed: ${error.code} ${error.message}`,
    )
    return { texts: new Map(), failed: true }
  }

  const texts = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.text && row.text.trim()) texts.set(row.id, row.text)
  }
  return { texts, failed: false }
}

/**
 * Fetch each state-statute chunk's own text by id.
 *
 * Mirrors `fetchGoverningDocChunkTexts` but against `state_statute_chunks`,
 * whose text column is `content`, not `text`. That table has no
 * `organization_id` — statutes are public law shared across every org, not
 * one association's private documents — so scoping is by chunk id only. Do
 * not add an org filter here: the column does not exist, and adding a
 * fabricated one would just make every lookup fail closed.
 */
export async function fetchStatuteChunkTexts(
  db: SupabaseClient<Database>,
  chunkIds: string[],
): Promise<{ texts: Map<string, string>; failed: boolean }> {
  if (chunkIds.length === 0) return { texts: new Map(), failed: false }

  const { data, error } = await db
    .from('state_statute_chunks')
    .select('id, content')
    .in('id', chunkIds)

  if (error) {
    console.error(
      `retrieveForThread: state statute chunk text fetch failed: ${error.code} ${error.message}`,
    )
    return { texts: new Map(), failed: true }
  }

  const texts = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.content && row.content.trim()) texts.set(row.id, row.content)
  }
  return { texts, failed: false }
}

/**
 * Resolve the org's state, then ask W30. Bundled into one function so the
 * whole thing is a single entry in the `Promise.allSettled` batch below —
 * state resolution stays off the critical path of the other three sources.
 *
 * W30's public output (`StateLawBrainOutput`) carries per-citation METADATA
 * only (chunkId/statuteId/codeCitation/title/category) — no per-chunk text.
 * Each citation's real text is fetched by id from `state_statute_chunks`
 * below, rather than attributing the one synthesized `answer` to every
 * citing chunk (that answer is preserved separately, see `answer` on the
 * return value, for background context — not as a per-citation quote).
 * A chunk id that comes back with no row, or that a failed fetch could not
 * resolve, is dropped rather than emitted with empty/placeholder text; the
 * caller is told via `degraded`.
 */
async function fetchStatuteCitations(
  db: SupabaseClient<Database>,
  orgId: string,
  question: string,
): Promise<{
  citations: SourceResults['statutes']['citations']
  unavailable: boolean
  degraded: string[]
  answer: string | null
}> {
  const state = await resolveAssociationState(db, orgId)
  if (!state) return { citations: [], unavailable: true, degraded: [], answer: null }

  const out = await askStateLaw(question, state, { organizationId: orgId })
  if (out.citations.length === 0 || !out.answer.trim()) {
    // A real, successful answer of "nothing on point" — not a failure.
    return { citations: [], unavailable: false, degraded: [], answer: null }
  }

  const { texts, failed } = await fetchStatuteChunkTexts(
    db,
    out.citations.map((c) => c.chunkId),
  )

  const citations: SourceResults['statutes']['citations'] = []
  let missing = false
  for (const c of out.citations) {
    const text = texts.get(c.chunkId)
    if (!text) {
      missing = true
      continue
    }
    citations.push({
      chunkId: c.chunkId,
      label: c.title ? `${c.codeCitation} — ${c.title}` : c.codeCitation,
      text,
    })
  }

  return {
    citations,
    unavailable: false,
    degraded: failed || missing ? ['state_law_chunk_text'] : [],
    answer: out.answer,
  }
}

/**
 * Render the property record as text the model can quote from. Only fields
 * that actually loaded are included — an absent field must be absent, not
 * rendered as zero, or the draft will tell a resident they owe nothing.
 *
 * The brief's version guessed at `PropertyContext`'s shape (`balanceCents`,
 * `openArcRequests`/`openTickets` as counts, no `residents`/
 * `lastCommunication`/`unitNumber`). The real shape
 * (apps/hoa/src/lib/inbox/queries.ts:548-561) is different in ways that
 * would have silently corrupted the draft:
 *   - `duesBalance` is already dollars (netted against payments), not
 *     cents. The brief's `balanceCents / 100` would have divided a real
 *     balance by another 100x too small — the exact "reads as nothing
 *     owed" failure this task's constraints call out.
 *   - `openArcRequests`/`openTickets` are arrays of records, not counts.
 *   - `residents` and `lastCommunication` exist and are included below;
 *     `unitNumber` is folded into the address line.
 */
function summarisePropertyContext(ctx: PropertyContext): string {
  const missing = new Set(ctx.degraded)
  const lines: string[] = []

  lines.push(`Address: ${ctx.unitNumber ? `${ctx.address} #${ctx.unitNumber}` : ctx.address}`)

  if (!missing.has('residents') && ctx.residents.length > 0) {
    lines.push(`Residents: ${ctx.residents.map((r) => `${r.name} (${r.role})`).join(', ')}`)
  }
  if (!missing.has('dues')) {
    const overdue = ctx.duesOverdueCount > 0 ? ` (${ctx.duesOverdueCount} overdue)` : ''
    lines.push(`Outstanding balance: $${ctx.duesBalance.toFixed(2)}${overdue}`)
  }
  if (!missing.has('violations')) {
    lines.push(`Open violations: ${ctx.openViolations}`)
  }
  if (!missing.has('arc')) {
    lines.push(`Open ARC requests: ${ctx.openArcRequests.length}`)
  }
  if (!missing.has('tickets')) {
    lines.push(`Open tickets: ${ctx.openTickets.length}`)
  }
  if (!missing.has('lastCommunication') && ctx.lastCommunication) {
    const when = ctx.lastCommunication.sentAt ? ` on ${ctx.lastCommunication.sentAt}` : ''
    lines.push(`Last communication: "${ctx.lastCommunication.subject}"${when}`)
  }

  return lines.join('\n')
}

/**
 * Assemble everything W32 needs for one thread.
 *
 * Every source degrades independently. A draft written without past replies
 * is still useful; a draft written while the dues query silently returned
 * nothing is dangerous, because "no balance shown" reads as "nothing owed".
 * That is why `degraded` is propagated rather than swallowed — Phase A
 * designed this exact trap out of the property rail, and prose has the same
 * failure mode.
 */
export async function retrieveForThread(
  db: SupabaseClient<Database>,
  orgId: string,
  threadId: string,
): Promise<ThreadRetrieval> {
  const thread = await getThreadDetail(db, orgId, threadId)
  if (!thread) {
    throw new Error(`retrieveForThread: thread ${threadId} not found in org ${orgId}`)
  }

  const messages = thread.messages.map((m) => ({
    direction: m.direction,
    from: m.fromName ?? m.fromEmail ?? 'Unknown',
    sentAt: m.sentAt,
    text: m.strippedText ?? m.bodyText ?? '',
  }))

  const latestInbound =
    [...messages].reverse().find((m) => m.direction === 'inbound' && m.text.trim())?.text ?? null

  // Nothing to search on. Return early rather than embedding an empty
  // string and retrieving arbitrary nearest neighbours.
  if (!latestInbound) {
    return {
      threadSubject: thread.subject,
      messages,
      latestInbound: null,
      fragments: [],
      degraded: ['no_inbound_text'],
      hasProperty: Boolean(thread.unitId),
      aiContext: { governingDocs: null, stateLaw: null },
    }
  }

  const degraded: string[] = []

  const [docsResult, statutesResult, propertyResult, repliesResult] = await Promise.allSettled([
    queryGoverningDocs(latestInbound, { organizationId: orgId }),
    fetchStatuteCitations(db, orgId, latestInbound),
    thread.unitId ? getPropertyContext(db, orgId, thread.unitId) : Promise.resolve(null),
    findSimilarReplies(db, orgId, latestInbound, threadId),
  ])

  let docs: SourceResults['docs'] = { citations: [] }
  let governingDocsContext: string | null = null
  if (docsResult.status === 'rejected') {
    console.error(`retrieveForThread: governing docs failed: ${String(docsResult.reason)}`)
    degraded.push('governing_documents')
  } else {
    const out = docsResult.value
    // GoverningDocsBrainOutput.citations (packages/workflows/src/
    // W1-governing-docs-brain/index.ts:28-33) is
    // `{ chunkId, documentId, docType, section }` — metadata only, no
    // `label`/`text` fields. Each citation's real text is fetched by id
    // from `governing_document_chunks` (org-scoped) rather than attributing
    // the one synthesized `answer` to every chunk that cited it — see
    // `fetchGoverningDocChunkTexts` above. The synthesized answer is kept
    // separately, for background context only, not as a per-citation quote.
    if (out.citations.length > 0 && out.answer.trim()) {
      const { texts, failed } = await fetchGoverningDocChunkTexts(
        db,
        orgId,
        out.citations.map((c) => c.chunkId),
      )

      const citations: SourceResults['docs']['citations'] = []
      let missing = false
      for (const c of out.citations) {
        const text = texts.get(c.chunkId)
        if (!text) {
          missing = true
          continue
        }
        citations.push({
          chunkId: c.chunkId,
          label: c.section ? `${c.docType} ${c.section}` : c.docType,
          text,
        })
      }

      if (failed || missing) degraded.push('governing_documents_chunk_text')
      docs = { citations }
      governingDocsContext = out.answer
    }
  }

  let statutes: SourceResults['statutes'] = { citations: [] }
  let stateLawContext: string | null = null
  if (statutesResult.status === 'rejected') {
    console.error(`retrieveForThread: state law failed: ${String(statutesResult.reason)}`)
    degraded.push('state_law')
  } else {
    statutes = { citations: statutesResult.value.citations }
    if (statutesResult.value.unavailable) degraded.push('state_law')
    degraded.push(...statutesResult.value.degraded)
    stateLawContext = statutesResult.value.answer
  }

  let property: SourceResults['property'] = null
  if (propertyResult.status === 'rejected') {
    console.error(`retrieveForThread: property context failed: ${String(propertyResult.reason)}`)
    degraded.push('property_context')
  } else if (propertyResult.value) {
    const ctx = propertyResult.value
    // getPropertyContext reports its own partial failures. Those names go
    // straight through: the reviewer must be told which facts are missing.
    degraded.push(...ctx.degraded)
    property = { summary: summarisePropertyContext(ctx) }
  } else if (thread.unitId) {
    // A unitId was on the thread but getPropertyContext resolved nothing
    // for it (e.g. the unit row is gone) — property data was expected and
    // is silently missing, not merely "not filed to a unit".
    degraded.push('property_context')
  }

  let pastReplies: SourceResults['pastReplies'] = []
  if (repliesResult.status === 'fulfilled') {
    pastReplies = repliesResult.value.replies.map((r) => ({
      messageId: r.messageId,
      subject: r.subject,
      body: r.body,
    }))
    degraded.push(...repliesResult.value.degraded)
  } else {
    console.error(`retrieveForThread: past replies failed: ${String(repliesResult.reason)}`)
    degraded.push('past_replies')
  }

  const collected = collectFragments({ docs, statutes, property, pastReplies, degraded })

  return {
    threadSubject: thread.subject,
    messages,
    latestInbound,
    fragments: collected.fragments,
    degraded: collected.degraded,
    hasProperty: Boolean(thread.unitId),
    aiContext: { governingDocs: governingDocsContext, stateLaw: stateLawContext },
  }
}
