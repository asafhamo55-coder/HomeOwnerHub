import type { CorrespondenceThreadSummary } from '@/lib/inbox/queries'

/**
 * The Correspondence section on the property detail page has four states
 * that must stay visually and structurally distinguishable:
 *
 *  - `unlinked` — this property has no bridged `units` row, so correspondence
 *    can't be matched to it at all.
 *  - `error`    — `listThreadsForUnit` threw (a soft read failure). This is
 *    NOT the same as "no correspondence" — collapsing the two would tell a
 *    board member a household has never written in when the truth is we
 *    just failed to check.
 *  - `empty`    — the read succeeded and there are zero threads.
 *  - `loaded`   — the read succeeded and there is at least one thread.
 *
 * Modeled as a discriminated union (rather than e.g. `threads: [] | null |
 * undefined` plus a `failed: boolean`) so a caller can't forget to check a
 * flag — every state has to be handled to read `threads` out of it.
 */
export type CorrespondenceSectionState =
  | { kind: 'unlinked' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'loaded'; threads: CorrespondenceThreadSummary[] }

/**
 * Resolves the four states above from the two raw inputs the page has
 * available: whether this property is bridged to a unit at all, and — only
 * when it is — the settled outcome of the `listThreadsForUnit` read (the
 * page runs that read through `Promise.allSettled` specifically so a
 * rejection can reach this function as data instead of tearing down the
 * whole page via `Promise.all`).
 *
 * Pure and side-effect free (no logging here) so it's cheap to unit test;
 * the page logs the rejection reason itself before calling this.
 */
export function resolveCorrespondenceState(
  unitId: string | null,
  outcome: PromiseSettledResult<CorrespondenceThreadSummary[]> | null,
): CorrespondenceSectionState {
  if (!unitId || !outcome) {
    return { kind: 'unlinked' }
  }
  if (outcome.status === 'rejected') {
    return { kind: 'error' }
  }
  return outcome.value.length === 0
    ? { kind: 'empty' }
    : { kind: 'loaded', threads: outcome.value }
}
