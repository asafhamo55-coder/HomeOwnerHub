/**
 * Mailbox scope filtering — the privacy control for this feature.
 *
 * HOA "mailboxes" in the wild are one of three things:
 *   1. a real Workspace account (board@hoa.org)
 *   2. a Google Group that fans out to board members' personal inboxes
 *   3. the president's personal Gmail
 *
 * In cases 2 and 3, syncing the whole inbox would pull private
 * correspondence into a shared board tool. So scope is enforced HERE,
 * before anything is persisted, and it FAILS CLOSED: a misconfigured
 * scope drops mail rather than defaulting to "everything".
 *
 * Delivered-To is what makes case 2 work — a Google Group address appears
 * only in that header, never in To.
 */

import type { ParsedMessage, ScopeMode } from './types'

// A plausible single email address: no whitespace/quotes/parens/commas
// (which are Gmail query metacharacters), exactly one `@`, non-empty local
// and domain parts. Not full RFC 5322 validation — deliberately pragmatic.
const ADDRESS_RE = /^[^\s"'()<>,]+@[^\s"'()<>,]+$/

// Gmail label ids are conservative tokens in practice (e.g. `Label_9`,
// `INBOX`). Restricting to this set keeps `label:<value>` unambiguous and
// rules out anything that could inject additional query syntax.
const LABEL_RE = /^[A-Za-z0-9_-]+$/

export function isInScope(
  message: ParsedMessage,
  scopeMode: ScopeMode,
  scopeValue: string | null,
): boolean {
  if (scopeMode === 'all') return true

  // Fail closed. Never treat a missing/blank scope value as "allow
  // everything". Trim first so a whitespace-only value can't slip past.
  const trimmed = scopeValue?.trim()
  if (!trimmed) return false

  if (scopeMode === 'label') {
    return message.labelIds.includes(trimmed)
  }

  if (scopeMode !== 'address') {
    // Unrecognized mode: fail closed by dropping the message. isInScope
    // runs per message inside a sync loop, so this must never throw —
    // buildScopeQuery is the place that rejects bad config loudly, before
    // any fetching happens.
    return false
  }

  const needle = trimmed.toLowerCase()
  // Sender included per Phase B D1 — see buildScopeQuery. `fromEmail` may be
  // null on a malformed envelope, so it is filtered rather than coerced:
  // String(null) would produce "null" and could match a scopeValue of "null".
  const haystack = [
    ...message.toEmails,
    ...message.ccEmails,
    ...message.deliveredTo,
    ...(message.fromEmail ? [message.fromEmail] : []),
  ].map((e) => e.toLowerCase())

  return haystack.includes(needle)
}

/**
 * The equivalent filter expressed as a Gmail search query, so backfill and
 * fallback re-sync never fetch out-of-scope mail in the first place.
 *
 * Unlike `isInScope`, this throws on invalid input instead of degrading.
 * It runs once per sync (not per message) to build the fetch-side query,
 * and the sync job wraps each mailbox in a try/catch that records
 * `sync_error` and leaves the cursor unadvanced — so a bad config surfaces
 * loudly instead of quietly widening the fetch to "everything".
 */
export function buildScopeQuery(
  scopeMode: ScopeMode,
  scopeValue: string | null,
  afterDate?: string,
): string {
  const clauses: string[] = []

  if (scopeMode === 'address') {
    if (scopeValue) {
      if (!ADDRESS_RE.test(scopeValue)) {
        throw new Error(
          `buildScopeQuery: scopeValue "${scopeValue}" is not a valid single email address`,
        )
      }
      // `from:` added in Phase B (D1). Without it the HOA's own replies are
      // excluded by construction: a real mailbox synced 153 inbound messages
      // and zero outbound. That left every thread showing one side of the
      // conversation and gave the reply corpus nothing to learn from.
      clauses.push(
        `(to:${scopeValue} OR cc:${scopeValue} OR deliveredto:${scopeValue} OR from:${scopeValue})`,
      )
    }
  } else if (scopeMode === 'label') {
    if (scopeValue) {
      if (!LABEL_RE.test(scopeValue)) {
        throw new Error(
          `buildScopeQuery: scopeValue "${scopeValue}" is not a valid Gmail label id`,
        )
      }
      clauses.push(`label:${scopeValue}`)
    }
  } else if (scopeMode !== 'all') {
    throw new Error(`buildScopeQuery: unrecognized scopeMode "${scopeMode}"`)
  }

  if (afterDate) clauses.push(`after:${afterDate}`)

  return clauses.join(' ')
}

/**
 * Pick a safe default immediately after OAuth.
 *
 * A non-primary sendAs alias is the strongest signal of a shared HOA
 * address sitting inside someone's personal account — recommend scoping
 * to it. Otherwise scope to the account's own address, which is still
 * narrower than 'all' and can be widened deliberately.
 */
export function recommendScope(
  sendAs: Array<{ sendAsEmail: string; isPrimary: boolean; isDefault: boolean }>,
  profileEmail: string,
): { scopeMode: ScopeMode; scopeValue: string | null } {
  const alias = sendAs.find(
    (s) => !s.isPrimary && s.sendAsEmail.toLowerCase() !== profileEmail.toLowerCase(),
  )

  return {
    scopeMode: 'address',
    scopeValue: (alias?.sendAsEmail ?? profileEmail).toLowerCase(),
  }
}
