import type { BoardWaiting } from '@/lib/approvals-inbox/waiting'

export const APPROVALS_PARTIAL_HINT = 'Some items could not be counted. Open the list to see them.'

/**
 * The Approvals tile's value, hint and state from the shared count.
 * "Inbox zero" only when every source loaded and every one is empty;
 * a failed count with nothing known is the failed state, never 0.
 */
export function approvalsTile(waiting: BoardWaiting): { value: string; hint: string; state: 'ready' | 'failed' } {
  const failedZero = waiting.failed && waiting.total === 0
  return {
    value: waiting.total.toLocaleString(),
    hint: failedZero ? '' : waiting.total === 0 ? 'Inbox zero' : waiting.failed ? APPROVALS_PARTIAL_HINT : 'waiting on you',
    state: failedZero ? 'failed' : 'ready',
  }
}
