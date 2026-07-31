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

export function isInScope(
  message: ParsedMessage,
  scopeMode: ScopeMode,
  scopeValue: string | null,
): boolean {
  if (scopeMode === 'all') return true

  // Fail closed. Never treat a missing scope value as "allow everything".
  if (!scopeValue) return false

  if (scopeMode === 'label') {
    return message.labelIds.includes(scopeValue)
  }

  const needle = scopeValue.trim().toLowerCase()
  const haystack = [
    ...message.toEmails,
    ...message.ccEmails,
    ...message.deliveredTo,
  ].map((e) => e.toLowerCase())

  return haystack.includes(needle)
}

/**
 * The equivalent filter expressed as a Gmail search query, so backfill and
 * fallback re-sync never fetch out-of-scope mail in the first place.
 */
export function buildScopeQuery(
  scopeMode: ScopeMode,
  scopeValue: string | null,
  afterDate?: string,
): string {
  const clauses: string[] = []

  if (scopeMode === 'address' && scopeValue) {
    clauses.push(
      `(to:${scopeValue} OR cc:${scopeValue} OR deliveredto:${scopeValue})`,
    )
  } else if (scopeMode === 'label' && scopeValue) {
    clauses.push(`label:${scopeValue}`)
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
