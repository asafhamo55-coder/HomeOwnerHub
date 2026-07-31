/**
 * Deterministic inbox matcher. No LLM.
 *
 * Matching is a keyed lookup where the keys are available, and it has to
 * be auditable — match_reason must be able to say "matched
 * j.rivera@gmail.com to 214 Oak Ln via property_residents" and mean it.
 * A model here would cost money on every spam email, give different
 * answers on reruns, and make a wrong filing hard to explain to a board.
 *
 * Six signals, highest confidence first:
 *   1. thread continuity  high    In-Reply-To/References hits a known message
 *   2. sender alias       high    a manager already taught us this address
 *   3. resident email     high    exactly one property for this address
 *   4. resident email     medium  MORE than one property — ambiguous
 *   5. address in body    medium  extracted from prose
 *   6. sender name         low    exactly one owner with this name
 *
 * ONLY high confidence auto-attaches. Everything else surfaces a
 * suggestion in triage, because a wrong attachment means Phase B drafts a
 * reply using another property's dues balance.
 *
 * Note on spoofing: From is trivially forgeable, so a match decides
 * FILING, never authorization. Nothing in this system grants access based
 * on a match.
 *
 * Error handling: every Supabase call below captures `error` and, on
 * failure, logs diagnostic context (function, table, org/thread id — NEVER
 * an email address, sender name, subject, or body, all of which are
 * resident PII) and throws. A transient DB failure must not silently look
 * like "no match" — that would send a known resident to triage with no
 * diagnosis, and applyMatch's callers depend on being able to retry a
 * thrown error instead of quietly mis-filing.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import type { Database, Json } from '@homeowner-portal/db/types'
import {
  escapeLikePattern,
  resolvePropertyByAddress,
  resolvePropertyByEmail,
  type PropertyMatch,
} from '../properties/resolve'

type Db = SupabaseClient<Database>

export type MatchRule =
  | 'thread_continuity'
  | 'sender_alias'
  | 'resident_email'
  | 'resident_email_ambiguous'
  | 'address_in_body'
  | 'sender_name'
  | 'none'

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none'

export interface MatchSignals {
  threadUnitId: string | null
  aliasUnitId: string | null
  aliasResidentId: string | null
  emailMatches: PropertyMatch[]
  addressUnitIds: string[]
  nameMatches: Array<{ unitId: string; residentId: string | null; residentName: string }>
}

export interface MatchReason {
  rule: MatchRule
  matched_on?: string
  candidate_unit_ids?: string[]
  [key: string]: unknown
}

export interface MatchOutcome {
  unitId: string | null
  residentId: string | null
  confidence: MatchConfidence
  rule: MatchRule
  reason: MatchReason
  status: 'open' | 'needs_review'
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

// ─── pure decision logic ─────────────────────────────────────────────

export function decideMatch(signals: MatchSignals): MatchOutcome {
  if (signals.threadUnitId) {
    return {
      unitId: signals.threadUnitId,
      residentId: null,
      confidence: 'high',
      rule: 'thread_continuity',
      reason: { rule: 'thread_continuity', matched_on: 'in_reply_to' },
      status: 'open',
    }
  }

  if (signals.aliasUnitId) {
    return {
      unitId: signals.aliasUnitId,
      residentId: signals.aliasResidentId,
      confidence: 'high',
      rule: 'sender_alias',
      reason: { rule: 'sender_alias', matched_on: 'inbox_sender_aliases' },
      status: 'open',
    }
  }

  if (signals.emailMatches.length === 1) {
    const hit = signals.emailMatches[0]
    return {
      unitId: hit.ref.unitId,
      residentId: hit.residentId,
      confidence: 'high',
      rule: 'resident_email',
      reason: { rule: 'resident_email', matched_on: hit.source },
      status: 'open',
    }
  }

  if (signals.emailMatches.length > 1) {
    // One person, several properties. Picking one would be a guess, and a
    // wrong guess feeds the wrong dues balance into a drafted reply.
    return {
      unitId: null,
      residentId: null,
      confidence: 'medium',
      rule: 'resident_email_ambiguous',
      reason: {
        rule: 'resident_email_ambiguous',
        matched_on: signals.emailMatches[0].source,
        candidate_unit_ids: signals.emailMatches.map((m) => m.ref.unitId),
      },
      status: 'needs_review',
    }
  }

  if (signals.addressUnitIds.length === 1) {
    return {
      unitId: null,
      residentId: null,
      confidence: 'medium',
      rule: 'address_in_body',
      reason: {
        rule: 'address_in_body',
        candidate_unit_ids: signals.addressUnitIds,
      },
      status: 'needs_review',
    }
  }

  if (signals.nameMatches.length === 1) {
    return {
      unitId: null,
      residentId: null,
      confidence: 'low',
      rule: 'sender_name',
      reason: {
        rule: 'sender_name',
        matched_on: signals.nameMatches[0].residentName,
        candidate_unit_ids: [signals.nameMatches[0].unitId],
      },
      status: 'needs_review',
    }
  }

  return {
    unitId: null,
    residentId: null,
    confidence: 'none',
    rule: 'none',
    reason: { rule: 'none' },
    status: 'needs_review',
  }
}

// ─── pure address extraction ─────────────────────────────────────────

const STREET_TYPE_WORDS = [
  'street', 'st', 'lane', 'ln', 'court', 'ct', 'drive', 'dr', 'road', 'rd',
  'avenue', 'ave', 'av', 'boulevard', 'blvd', 'circle', 'cir', 'place', 'pl',
  'terrace', 'ter', 'trail', 'trl', 'way',
]

/**
 * Pull candidate street addresses out of prose.
 *
 * Shape: a house number, one to three name words, then a street type.
 * Requiring the street type is what keeps "Invoice 4417" and "$340 due on
 * 15 July" from registering as addresses.
 */
export function extractAddressCandidates(text: string | null): string[] {
  if (!text) return []

  const pattern = new RegExp(
    String.raw`\b(\d{1,6})\s+((?:[A-Za-z][A-Za-z'’-]*\s+){1,3}?)(${STREET_TYPE_WORDS.join('|')})\b\.?`,
    'gi',
  )

  const found = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    found.add(`${match[1]} ${match[2].trim()} ${match[3]}`.replace(/\s+/g, ' ').trim())
  }
  return [...found]
}

// ─── database probe ──────────────────────────────────────────────────

export async function matchThread(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<MatchOutcome> {
  const { data: messages, error: messagesError } = await db
    .from('inbox_messages')
    .select('from_email, from_name, subject, stripped_text, in_reply_to, references_ids')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })

  if (messagesError) {
    logDbError('matchThread', 'inbox_messages', { orgId, threadId }, messagesError)
    throw messagesError
  }

  const first = messages?.[0]
  if (!first) return decideMatch(buildEmptySignals())

  const signals = buildEmptySignals()

  // ── 1. thread continuity ────────────────────────────────────────
  const parentIds = [first.in_reply_to, ...(first.references_ids ?? [])].filter(
    (v): v is string => Boolean(v),
  )
  if (parentIds.length > 0) {
    // Scoped to this org: rfc822_message_id is caller-controlled mail
    // header text, not guaranteed globally unique. An unscoped lookup
    // here would let a collision (or a crafted header) attach a thread
    // to another tenant's unit — exactly the class of mistake this
    // module exists to prevent.
    const { data: parent, error: parentError } = await db
      .from('inbox_messages')
      .select('thread_id')
      .eq('organization_id', orgId)
      .in('rfc822_message_id', parentIds)
      .neq('thread_id', threadId)
      .limit(1)
      .maybeSingle()

    if (parentError) {
      logDbError('matchThread', 'inbox_messages', { orgId, threadId }, parentError)
      throw parentError
    }

    if (parent) {
      const { data: parentThread, error: parentThreadError } = await db
        .from('inbox_threads')
        .select('unit_id')
        .eq('organization_id', orgId)
        .eq('id', parent.thread_id)
        .maybeSingle()

      if (parentThreadError) {
        logDbError('matchThread', 'inbox_threads', { orgId, threadId }, parentThreadError)
        throw parentThreadError
      }

      signals.threadUnitId = parentThread?.unit_id ?? null
    }

    if (!signals.threadUnitId) {
      // Also try the outbound comms module — a resident replying to a
      // notice we sent through communications.
      const { data: recipient, error: recipientError } = await db
        .from('communication_recipients')
        .select('unit_id')
        .eq('organization_id', orgId)
        .in('external_id', parentIds)
        .limit(1)
        .maybeSingle()

      if (recipientError) {
        logDbError(
          'matchThread',
          'communication_recipients',
          { orgId, threadId },
          recipientError,
        )
        throw recipientError
      }

      signals.threadUnitId = recipient?.unit_id ?? null
    }
  }

  const senderEmail = first.from_email
  if (senderEmail) {
    // ── 2. sender alias ───────────────────────────────────────────
    const { data: alias, error: aliasError } = await db
      .from('inbox_sender_aliases')
      .select('unit_id, resident_id')
      .eq('organization_id', orgId)
      .ilike('email_address', escapeLikePattern(senderEmail))
      .maybeSingle()

    if (aliasError) {
      logDbError('matchThread', 'inbox_sender_aliases', { orgId, threadId }, aliasError)
      throw aliasError
    }

    signals.aliasUnitId = alias?.unit_id ?? null
    signals.aliasResidentId = alias?.resident_id ?? null

    // ── 3/4. resident email ───────────────────────────────────────
    // resolvePropertyByEmail escapes its own LIKE pattern and throws on
    // any query failure — no additional error handling needed here.
    signals.emailMatches = await resolvePropertyByEmail(db, orgId, senderEmail)
  }

  // ── 5. address in body or subject ───────────────────────────────
  const haystack = [first.subject, first.stripped_text].filter(Boolean).join('\n')
  const candidateUnitIds = new Set<string>()
  for (const candidate of extractAddressCandidates(haystack)) {
    for (const ref of await resolvePropertyByAddress(db, orgId, candidate)) {
      candidateUnitIds.add(ref.unitId)
    }
  }
  signals.addressUnitIds = [...candidateUnitIds]

  // ── 6. sender name ──────────────────────────────────────────────
  if (first.from_name && first.from_name.trim().length > 2) {
    const { data: residents, error: residentsError } = await db
      .from('property_residents')
      .select('id, full_name, property_id')
      .eq('organization_id', orgId)
      .is('moved_out_at', null)
      .ilike('full_name', escapeLikePattern(first.from_name.trim()))

    if (residentsError) {
      logDbError('matchThread', 'property_residents', { orgId, threadId }, residentsError)
      throw residentsError
    }

    const propertyIds = (residents ?? []).map((r) => r.property_id)
    if (propertyIds.length > 0) {
      const { data: units, error: unitsError } = await db
        .from('units')
        .select('id, legacy_hoa_property_id')
        .eq('organization_id', orgId)
        .in('legacy_hoa_property_id', propertyIds)

      if (unitsError) {
        logDbError('matchThread', 'units', { orgId, threadId }, unitsError)
        throw unitsError
      }

      signals.nameMatches = (units ?? []).map((u) => {
        const resident = (residents ?? []).find(
          (r) => r.property_id === u.legacy_hoa_property_id,
        )
        return {
          unitId: u.id,
          residentId: resident?.id ?? null,
          residentName: resident?.full_name ?? '',
        }
      })
    }
  }

  return decideMatch(signals)
}

function buildEmptySignals(): MatchSignals {
  return {
    threadUnitId: null,
    aliasUnitId: null,
    aliasResidentId: null,
    emailMatches: [],
    addressUnitIds: [],
    nameMatches: [],
  }
}

/**
 * Write an outcome to the thread.
 *
 * Refuses to overwrite a manual assignment. A manager who filed a thread
 * by hand must not have it silently re-filed when a new message arrives.
 * Also refuses to reopen a closed thread — a re-match on new mail must not
 * pull a thread a manager already closed back into the open queue.
 */
export async function applyMatch(
  db: Db,
  threadId: string,
  outcome: MatchOutcome,
): Promise<void> {
  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .select('match_source, status')
    .eq('id', threadId)
    .maybeSingle()

  if (threadError) {
    logDbError('applyMatch', 'inbox_threads', { threadId }, threadError)
    throw threadError
  }

  if (thread?.match_source === 'manual') return

  const { error: updateError } = await db
    .from('inbox_threads')
    .update({
      unit_id: outcome.unitId,
      resident_id: outcome.residentId,
      match_confidence: outcome.confidence,
      // MatchReason's `[key: string]: unknown` index signature (needed so
      // callers can attach ad hoc audit fields) isn't structurally
      // comparable to the generated Json type, even though every value we
      // ever put in reason IS plain JSON (strings, string arrays). The
      // double cast documents that gap rather than silently widening
      // MatchReason to `any`.
      match_reason: outcome.reason as unknown as Json,
      match_source: 'auto',
      // Never reopen a closed thread just because it was re-matched.
      status: thread?.status === 'closed' ? 'closed' : outcome.status,
    })
    .eq('id', threadId)

  if (updateError) {
    logDbError('applyMatch', 'inbox_threads', { threadId }, updateError)
    throw updateError
  }
}
