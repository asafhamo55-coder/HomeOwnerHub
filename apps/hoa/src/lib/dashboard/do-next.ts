/**
 * "Do this next": the one thing the board should do first, picked from
 * numbers the dashboard already loads. Pure: no reads, no React.
 *
 * Every source is a Check. `failed` means the read errored, so the number is
 * UNKNOWN. A failed source is skipped, and if nothing else is urgent the
 * answer is "unsure", never "all caught up". `na` means the source does not
 * apply to this member (for example setup work for a non-admin).
 */
export type Check<T> = { status: 'ok'; value: T } | { status: 'failed' } | { status: 'na' }

export const ok = <T,>(value: T): Check<T> => ({ status: 'ok', value })
export const FAILED: Check<never> = { status: 'failed' }
export const NA: Check<never> = { status: 'na' }

export interface SetupNext {
  title: string
  href: string
  cta: string
}

export interface DoNextInput {
  /** State law deadlines already past and not marked done. */
  complianceOverdue: Check<number>
  /** Requests waiting for a board decision. */
  approvals: Check<number>
  /** Resident emails still waiting for a reply. */
  residentReplies: Check<number>
  /** Violations past their fix-by (cure) date. */
  violationsOverdue: Check<number>
  /** Homes behind on dues. */
  homesBehind: Check<number>
  /** The first unfinished required setup step, or null when setup is done. */
  setup: Check<SetupNext | null>
}

export type DoNextKey = 'compliance' | 'approvals' | 'replies' | 'violations' | 'dues' | 'setup'

export type DoNext =
  | { kind: 'item'; key: DoNextKey; message: string; cta: string; href: string }
  | { kind: 'caught_up'; message: string }
  | { kind: 'unsure'; message: string; cta: string; href: string }

const n = (count: number, one: string, many: string) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`

/** A source's count if it answered and is above zero, else 0. */
function positive(c: Check<number>): number {
  return c.status === 'ok' && c.value > 0 ? c.value : 0
}

export function pickDoNext(input: DoNextInput): DoNext {
  const compliance = positive(input.complianceOverdue)
  if (compliance > 0) {
    return {
      kind: 'item',
      key: 'compliance',
      message: `${n(compliance, 'state law deadline has', 'state law deadlines have')} passed.`,
      cta: 'See the deadlines',
      href: '#compliance-deadlines',
    }
  }
  const approvals = positive(input.approvals)
  if (approvals > 0) {
    return {
      kind: 'item',
      key: 'approvals',
      message: `${n(approvals, 'request is', 'requests are')} waiting for your approval.`,
      cta: 'Review them',
      href: '#approvals',
    }
  }
  const replies = positive(input.residentReplies)
  if (replies > 0) {
    return {
      kind: 'item',
      key: 'replies',
      message: `${n(replies, 'resident email is', 'resident emails are')} waiting for a reply.`,
      cta: 'Open the inbox',
      href: '/inbox',
    }
  }
  const violations = positive(input.violationsOverdue)
  if (violations > 0) {
    return {
      kind: 'item',
      key: 'violations',
      message: `${n(violations, 'violation is', 'violations are')} past the fix-by date.`,
      cta: 'See violations',
      href: '/violations',
    }
  }
  const homes = positive(input.homesBehind)
  if (homes > 0) {
    return {
      kind: 'item',
      key: 'dues',
      message: `${n(homes, 'home is', 'homes are')} behind on dues.`,
      cta: 'See who owes',
      href: '/dues',
    }
  }
  if (input.setup.status === 'ok' && input.setup.value) {
    const s = input.setup.value
    return { kind: 'item', key: 'setup', message: `Next setup step: ${s.title}.`, cta: s.cta, href: s.href }
  }

  const anyFailed = Object.values(input).some((c: Check<unknown>) => c.status === 'failed')
  if (anyFailed) {
    return { kind: 'unsure', message: 'We couldn’t check everything. Try again.', cta: 'Try again', href: '/' }
  }
  return { kind: 'caught_up', message: 'You’re all caught up. Nothing needs you right now.' }
}
