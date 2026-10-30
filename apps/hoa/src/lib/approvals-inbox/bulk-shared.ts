// Client-safe half of bulk approve: the eligibility rules and the toast
// summary. Kept apart from bulk.ts, which imports the server-only approve
// handlers (packages/workflows pulls in node:crypto), so the BulkApprove
// client component can import these without breaking the browser bundle.

import type { InboxItem } from './model'

/** Sources the board may approve several at a time. */
export const BULK_SOURCES = ['w3', 'contact'] as const
export type BulkSource = (typeof BULK_SOURCES)[number]

/** Most items one call will touch. */
export const BULK_CAP = 50

export function isBulkSource(source: string): source is BulkSource {
  return (BULK_SOURCES as readonly string[]).includes(source)
}

/** Whether a row gets a checkbox: a bulk source with a one-click approve that is not withheld. */
export function isBulkEligible(item: Pick<InboxItem, 'source' | 'decision'>): boolean {
  const d = item.decision
  if (!d || !isBulkSource(item.source)) return false
  if (d.kind === 'w3') return true
  return d.kind === 'contact' && d.canApprove
}

export interface ApproveManyItemResult {
  source: string
  id: string
  ok: boolean
  /** The per-item message on success, the reason on failure. */
  message: string
}

/** "4 approved, 1 could not be approved: <reason>". Several reasons: the first, plus a count. */
export function summarizeBulk(results: ApproveManyItemResult[]): { approved: number; failed: number; text: string } {
  const approved = results.filter((r) => r.ok).length
  const failures = results.filter((r) => !r.ok)
  const failed = failures.length
  if (failed === 0) return { approved, failed, text: `${approved} approved.` }
  const reasons = [...new Set(failures.map((f) => f.message))]
  const reason =
    reasons.length === 1 ? reasons[0]! : `${reasons[0]!} (${reasons.length - 1} other ${reasons.length === 2 ? 'reason' : 'reasons'})`
  const head = approved === 0 ? 'None' : String(approved)
  return { approved, failed, text: `${head} approved, ${failed} could not be approved: ${reason}` }
}
