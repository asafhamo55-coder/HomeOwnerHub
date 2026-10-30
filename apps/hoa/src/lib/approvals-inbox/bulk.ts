// Bulk approve on /approvals. This file holds NO approval logic: approveManyFor
// loops decideApprovalFor, the same per-item path the single Approve button
// takes, so each item is re-checked for role, org and eligibility on its own.
//
// Bulk is allowed only for sources that move no money and need no judgement
// beyond "yes". Every other source stays one at a time:
//   w18, bill, opening, pro  money (ledger posts, bills, a professional's entry)
//   collections              a demand letter for money owed; read each one
//   arc                      the board picks the decision and edits the letter
//   join                     grants access to a home; check who is asking
//   vendor                   contract approval; COI and conflict gates, no audit row
//
// Server only: decide.ts reaches packages/workflows. Client code imports the
// rules and summary from ./bulk-shared instead.

import { z } from 'zod'
import { decideApprovalFor, type InboxDecisionHandlers } from './decide'
import type { ApprovalSource } from './model'
import { BULK_CAP, isBulkSource, type ApproveManyItemResult, type BulkSource } from './bulk-shared'

export { BULK_CAP, BULK_SOURCES, isBulkEligible, isBulkSource, summarizeBulk } from './bulk-shared'
export type { ApproveManyItemResult, BulkSource } from './bulk-shared'

const InputSchema = z.record(z.string(), z.array(z.string()))

/** Ids to approve, grouped by source. */
export type ApproveManyInput = Partial<Record<ApprovalSource, string[]>>

export type ApproveManyOutcome = { ok: true; results: ApproveManyItemResult[] } | { ok: false; error: string }

const UUID = z.string().uuid()

export async function approveManyFor(
  role: string | null | undefined,
  raw: unknown,
  handlers: InboxDecisionHandlers,
  onApproved?: (source: BulkSource, id: string) => Promise<void>,
): Promise<ApproveManyOutcome> {
  const parsed = InputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'That selection isn’t valid.' }

  const pairs: Array<[string, string]> = []
  const seen = new Set<string>()
  for (const [source, ids] of Object.entries(parsed.data)) {
    for (const id of ids) {
      const key = `${source}:${id}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([source, id])
    }
  }
  if (pairs.length === 0) return { ok: false, error: 'Nothing was selected.' }
  if (pairs.length > BULK_CAP) {
    return { ok: false, error: `Select at most ${BULK_CAP} items at a time. You selected ${pairs.length}.` }
  }

  const results: ApproveManyItemResult[] = []
  for (const [source, id] of pairs) {
    if (!isBulkSource(source)) {
      results.push({ source, id, ok: false, message: 'This type is approved one item at a time.' })
      continue
    }
    if (!UUID.safeParse(id).success) {
      results.push({ source, id, ok: false, message: 'That approval item isn’t valid.' })
      continue
    }
    // decideApprovalFor re-checks the role; the module's own approve then
    // re-checks the org and that the item is still waiting.
    let r: Awaited<ReturnType<typeof decideApprovalFor>>
    try {
      r = await decideApprovalFor(role, { kind: source, id, decision: 'approve' }, handlers)
    } catch {
      // One item failing must not hide what the others did.
      results.push({ source, id, ok: false, message: 'Couldn’t approve this one. Try again.' })
      continue
    }
    if (r.ok) {
      await onApproved?.(source, id)
      results.push({ source, id, ok: true, message: r.message })
    } else {
      results.push({ source, id, ok: false, message: r.error })
    }
  }
  return { ok: true, results }
}
