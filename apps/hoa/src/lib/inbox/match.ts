/**
 * ⚠ CROSS-PACKAGE CONSTRAINT — read this before adding an import here.
 *
 * `packages/jobs` imports this module DIRECTLY over a relative path
 * (`../../../apps/hoa/src/lib/...`), compiling it under its OWN tsconfig
 * rather than the `hoa` app's. Four files are shared this way:
 *
 *   apps/hoa/src/lib/inbox/ingest.ts
 *   apps/hoa/src/lib/inbox/match.ts
 *   apps/hoa/src/lib/properties/resolve.ts
 *   apps/hoa/src/lib/properties/normalize-address.ts
 *
 * That only works because every import in them that leaves this set of
 * four is `import type` — fully erased by TypeScript, so there is no
 * runtime dependency for the jobs package to resolve. Therefore, in this
 * file:
 *
 *   - NO `@/…` path aliases — jobs' tsconfig does not define them.
 *   - NO `import 'server-only'` — not a dependency of this repo, and the
 *     jobs package is not a Next runtime. (This is the tempting one: the
 *     file is full of service-role queries.)
 *   - NO Next-specific imports (`next/*`, `next/headers`, `next/cache`).
 *   - Value imports only from the other three files above; everything
 *     else stays `import type`.
 *   - Need a runtime helper? Copy it in (see the local `logDbError` in
 *     ingest.ts / match.ts) or add it to `@homeowner-portal/db` /
 *     `@homeowner-portal/mailbox`, both of which jobs already depends on.
 *
 * Breaking any of these leaves `pnpm --filter hoa typecheck` GREEN and
 * fails `pnpm --filter @homeowner-portal/jobs typecheck` instead — the
 * error surfaces in a package that does not contain the edit, which is
 * why it is written here and not only on the consumer side
 * (packages/jobs/src/mailbox-sync.ts).
 */

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

  // Normalized once, up front, so every subsequent comparison — the alias
  // lookup and resolvePropertyByEmail — sees the same value. Without this,
  // incidental whitespace or mixed case from header parsing would make the
  // sender-alias lookup (signal 2, HIGH confidence) silently miss while
  // resolvePropertyByEmail's own internal normalization still succeeds,
  // making signal precedence depend on incidental formatting.
  const senderEmail = first.from_email ? first.from_email.trim().toLowerCase() : null
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
      .is('deleted_at', null)
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
 *
 * Also refuses to touch a CLOSED thread at all — not just its `status`
 * column (amended post-review, Task 21 finding 3 — see
 * `.superpowers/sdd/task-21-report.md`, "Fix pass — org-scoping +
 * silent failures"). The previous version pinned `status` back to
 * `'closed'` but still overwrote `unit_id`/`resident_id`/
 * `match_confidence`/`match_reason` with a fresh outcome whenever new
 * mail landed on a closed thread — so the thread's filing silently
 * changed while closed, and if a manager reopened it later, it could
 * sit under a property no human had approved.
 *
 * This guard is on `status`, not on `setThreadStatus` stamping
 * `match_source = 'manual'` when a thread is closed — that alternative
 * was considered and rejected. Closing a thread is a judgement about
 * whether the CONVERSATION is done, not a judgement about WHICH
 * property it belongs to; marking the match "manual" on every close
 * would overclaim a decision the manager never made, and would
 * permanently block auto-matching on that thread even after it's
 * reopened. Gating on `status === 'closed'` instead freezes match state
 * only while closed. Reopening makes the thread eligible for matching
 * again; actual matching resumes on the next inbound message. This is the
 * same "manual survives forever, status guard is temporary" split the rest
 * of this module already relies on.
 *
 * Both guards are expressed as predicates ON THE UPDATE
 * (`.neq('match_source', 'manual')`, `.neq('status', 'closed')`), not as a
 * SELECT-then-decide in JavaScript (amended post-review — final branch
 * review, Fix 1). The previous version read `match_source`/`status`,
 * tested them here, and then issued an UNCONDITIONAL update; a manual
 * assignment committing in the window between those two statements was
 * silently overwritten — `unit_id` reverted to the auto outcome (possibly
 * NULL), `match_source` flipped back to `'auto'`, `status` back to
 * `'needs_review'`. That window is not theoretical: the ordinary trigger
 * is a resident replying to a thread the manager just filed by hand,
 * which is precisely when the sync job runs this function. Evaluating the
 * predicates inside the same statement that writes makes the guard atomic
 * — Postgres takes the row lock, re-checks under it, and a concurrent
 * manual assignment simply makes the UPDATE match zero rows.
 *
 * A guarded no-op is therefore a zero-row UPDATE, which PostgREST reports
 * as success with no error — the same silent return the JS guard gave,
 * and deliberately NOT logged as a failure: refusing to overwrite a manual
 * filing is the intended outcome, not a fault. (Distinguishing "guarded"
 * from "thread doesn't exist" would need `count: 'exact'`, and neither
 * case is actionable here — the sync job re-matches on the next inbound
 * message either way.)
 *
 * The preceding SELECT was REMOVED rather than kept alongside the new
 * predicates: its only consumer was the JS guard, it could not tell the
 * truth about the row at write time anyway (that was the bug), and a
 * second round-trip per matched thread is not free on a 50-thread sync.
 * `match_source` and `status` are both NOT NULL (migration 0029), so
 * `.neq` cannot be defeated by SQL's NULL comparison semantics.
 *
 * Scoped to orgId on the UPDATE — matching every other query in this
 * module — because the only caller (packages/jobs/mailbox-sync) uses a
 * service-role client that bypasses RLS entirely. RLS is not a backstop
 * here: if a caller bug ever paired a thread id with the wrong
 * organization, an unscoped query would happily write match state onto
 * another tenant's thread.
 */
export async function applyMatch(
  db: Db,
  orgId: string,
  threadId: string,
  outcome: MatchOutcome,
): Promise<void> {
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
      status: outcome.status,
    })
    .eq('organization_id', orgId)
    .eq('id', threadId)
    // The guard. See the doc comment above for why these are predicates on
    // the write and not a preceding SELECT.
    .neq('match_source', 'manual')
    .neq('status', 'closed')

  if (updateError) {
    logDbError('applyMatch', 'inbox_threads', { orgId, threadId }, updateError)
    throw updateError
  }
}

// ─── Vendor auto-match ───────────────────────────────────────────────

/**
 * File a thread under a vendor when its sender address is a vendor's
 * `primary_email`.
 *
 * Vendor identity is an EXACT email match — no confidence tiers, no fuzzy
 * name comparison. It is deliberately kept out of `decideMatch`, which is a
 * confidence ladder for property/resident matching: folding an exact-match
 * rule into that ladder would add a tier meaning something categorically
 * different from every other, in a function whose ordering is load-bearing.
 *
 * It is also deliberately NOT called from `applyMatch`. That function owns
 * one statement with its guard as predicates ON the UPDATE, and its tests
 * assert structurally that it never reads `inbox_threads` first (no TOCTOU
 * window). Vendor filing is a separate concern with its own guard, so it
 * sits beside `applyMatch` in the ingest pipeline rather than inside it.
 *
 * The "never overwrite a human's assignment" guarantee is the
 * `.is('vendor_id', null)` predicate on the UPDATE itself — not a preceding
 * SELECT — for exactly the reason `applyMatch`'s docstring gives: a
 * read-then-decide version passes every behavioural test against a
 * single-threaded mock while still losing the race in production.
 *
 * A failure here is logged and swallowed. A vendor lookup must never fail
 * an ingest that otherwise succeeded.
 */
export async function applyVendorMatch(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<void> {
  const { data: message, error: messageError } = await db
    .from('inbox_messages')
    .select('from_email')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ from_email: string | null }>()

  if (messageError) {
    logDbError('applyVendorMatch', 'inbox_messages', { orgId, threadId }, messageError)
    return
  }
  if (!message?.from_email) return

  const { data: vendor, error: vendorError } = await db
    .from('vendors' as never)
    .select('id')
    .eq('organization_id', orgId)
    .eq('primary_email', message.from_email.trim().toLowerCase())
    .maybeSingle<{ id: string }>()

  if (vendorError) {
    logDbError('applyVendorMatch', 'vendors', { orgId, threadId }, vendorError)
    return
  }
  if (!vendor) return

  const { error: updateError } = await db
    .from('inbox_threads')
    .update({ vendor_id: vendor.id } as never)
    .eq('organization_id', orgId)
    .eq('id', threadId)
    // THE guard. A thread already filed under a vendor — by a human or an
    // earlier run — is never overwritten.
    .is('vendor_id', null)

  if (updateError) {
    logDbError('applyVendorMatch', 'inbox_threads', { orgId, threadId }, updateError)
  }
}
