// Plain (non-"use server") module so the constants + type can be
// imported from client components and server actions alike.
// `lib/violations.ts` is marked "use server" and Next 15 forbids
// exporting anything except async functions from such a file.

import { VIOLATION_FINED_STATUS_LIVE } from '@homeowner-portal/db/violation-statuses'

export const VIOLATION_STATUSES = [
  'open',
  'notice_sent',
  'fined',
  'resolved',
  'dismissed',
] as const

export type ViolationStatus = (typeof VIOLATION_STATUSES)[number]

/**
 * Statuses the production database refuses (23514) until migration 0066
 * part 5 is applied and VIOLATION_FINED_STATUS_LIVE is flipped.
 */
export const GATED_VIOLATION_STATUSES: readonly ViolationStatus[] = ['fined', 'dismissed']

export const VIOLATION_STATUS_NOT_LIVE =
  'Fined and Dismissed are not available yet. We are finishing a database update; for now use Notice sent or Resolved.'

/** Can this status be saved right now? */
export function isViolationStatusLive(status: ViolationStatus, live: boolean = VIOLATION_FINED_STATUS_LIVE): boolean {
  return live || !GATED_VIOLATION_STATUSES.includes(status)
}

/**
 * The statuses the editor offers. The current status is always kept so the
 * select never shows a value it has no option for.
 */
export function selectableViolationStatuses(
  current: ViolationStatus,
  live: boolean = VIOLATION_FINED_STATUS_LIVE,
): ViolationStatus[] {
  return VIOLATION_STATUSES.filter((s) => s === current || isViolationStatusLive(s, live))
}
