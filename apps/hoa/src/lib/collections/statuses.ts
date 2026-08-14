// The collections status ladder and event vocabulary.
//
// Pure module — no React, no Supabase imports — so it runs under vitest's
// node-only harness, matching lib/properties/severity.ts.
//
// SINGLE SOURCE OF TRUTH. hoa_violations drifted: `fined` and `dismissed`
// exist in apps/hoa/src/lib/violation-statuses.ts and are NOT valid values
// in hoa_violations_status_check, so saving either fails at the database.
// Every value below is mirrored from the CHECK constraints in
// migrations/0047_collections.sql and must be changed in both places
// together. The type is derived from the array, so a typo is a compile
// error at every call site rather than a runtime constraint violation.

import type { Database } from '@homeowner-portal/db/types'

/** Ordered: index is the escalation rung. Terminal states last. */
export const COLLECTION_STATUSES = [
  'monitoring',
  'collection_letter',
  'lien_warning',
  'lien_letter',
  'board_authorized_suit',
  'attorney_presuit',
  'suit_filed',
  'resolved',
  'written_off',
] as const

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

/**
 * Compile-time proof that this list matches the database.
 *
 * `collection_cases.status` is typed as a bare `string` by
 * `supabase gen types` (the column is text + CHECK, not a Postgres enum),
 * so this cannot check the *values*. What it does catch is the column
 * being dropped, renamed, or retyped out from under us — the assignment
 * stops compiling. Value drift is caught instead by the round-trip test in
 * statuses.test.ts, which asserts this array against the constraint text
 * quoted in the migration.
 */
type DbCollectionStatus = Database['public']['Tables']['collection_cases']['Row']['status']
const _statusesAreAssignableToDb: DbCollectionStatus = 'monitoring' satisfies CollectionStatus
void _statusesAreAssignableToDb

/** Statuses where the case is closed and no longer needs board attention. */
export const TERMINAL_STATUSES = ['resolved', 'written_off'] as const satisfies readonly CollectionStatus[]

export function isTerminal(status: CollectionStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status)
}

/** Board-facing label. Never show a raw snake_case status to a manager. */
export function collectionStatusLabel(status: CollectionStatus): string {
  switch (status) {
    case 'monitoring':
      return 'Monitoring'
    case 'collection_letter':
      return 'Collection letter sent'
    case 'lien_warning':
      return '30-day lien warning'
    case 'lien_letter':
      return 'Lien letter sent'
    case 'board_authorized_suit':
      return 'Board authorized suit'
    case 'attorney_presuit':
      return 'With attorney — presuit'
    case 'suit_filed':
      return 'Suit filed'
    case 'resolved':
      return 'Resolved'
    case 'written_off':
      return 'Written off'
  }
}

/**
 * Badge tone. Deliberately coarse: everything from the lien warning onward
 * is `destructive`, because once a lien letter is in play the association
 * is on a legal clock and the board should not have to read the label to
 * notice. Terminal states are neutral — a resolved case is not a warning.
 */
export type CollectionTone = 'neutral' | 'warning' | 'destructive'

export function collectionStatusTone(status: CollectionStatus): CollectionTone {
  switch (status) {
    case 'monitoring':
      return 'neutral'
    case 'collection_letter':
      return 'warning'
    case 'lien_warning':
    case 'lien_letter':
    case 'board_authorized_suit':
    case 'attorney_presuit':
    case 'suit_filed':
      return 'destructive'
    case 'resolved':
    case 'written_off':
      return 'neutral'
  }
}

// ─── Events ──────────────────────────────────────────────────────────

export const COLLECTION_EVENT_TYPES = [
  'note',
  'collection_letter_sent',
  'lien_warning_sent',
  'lien_letter_sent',
  'lien_filed',
  'board_authorized_suit',
  'turned_over_to_attorney',
  'demand_letter_sent',
  'payment_received',
  'payment_plan_agreed',
  'status_changed',
  'case_closed',
] as const

export type CollectionEventType = (typeof COLLECTION_EVENT_TYPES)[number]

export function collectionEventLabel(kind: CollectionEventType): string {
  switch (kind) {
    case 'note':
      return 'Note'
    case 'collection_letter_sent':
      return 'Collection letter sent'
    case 'lien_warning_sent':
      return '30-day lien warning sent'
    case 'lien_letter_sent':
      return 'Lien letter sent'
    case 'lien_filed':
      return 'Lien filed'
    case 'board_authorized_suit':
      return 'Board authorized suit'
    case 'turned_over_to_attorney':
      return 'Turned over to attorney'
    case 'demand_letter_sent':
      return 'Demand letter sent'
    case 'payment_received':
      return 'Payment received'
    case 'payment_plan_agreed':
      return 'Payment plan agreed'
    case 'status_changed':
      return 'Status changed'
    case 'case_closed':
      return 'Case closed'
  }
}

/**
 * The status a case moves to when an event of this type is recorded, or
 * null when the event does not imply a stage change (a note, a payment).
 *
 * Advisory only — the caller decides whether to apply it, and the board can
 * always set status directly. Collections does not always run forward: an
 * account can be pulled back from the attorney after a payment plan.
 */
export function statusImpliedBy(kind: CollectionEventType): CollectionStatus | null {
  switch (kind) {
    case 'collection_letter_sent':
      return 'collection_letter'
    case 'lien_warning_sent':
      return 'lien_warning'
    case 'lien_letter_sent':
    case 'lien_filed':
      return 'lien_letter'
    case 'board_authorized_suit':
      return 'board_authorized_suit'
    case 'turned_over_to_attorney':
    case 'demand_letter_sent':
      return 'attorney_presuit'
    case 'case_closed':
      return 'resolved'
    case 'note':
    case 'payment_received':
    case 'payment_plan_agreed':
    case 'status_changed':
      return null
  }
}
