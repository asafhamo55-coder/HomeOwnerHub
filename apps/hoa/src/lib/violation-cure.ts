// Cure deadlines for violations. Pure (vitest node harness).
//
// "Past cure" means what it means in hoa_property_list_v
// (violations_past_cure): a notice went out, notice_sent_at + cure period
// is behind us, and the violation is not closed (the view only excludes
// resolved and waived; dismissed and cured are closed here too). The property page's
// "past cure" stat and its Violations tab badge must agree with it.

export interface CureSource {
  status: string
  notice_sent_at: string | null
  cure_period_days: number | null
  created_at: string | null
}

export type CureState = 'past' | 'pending' | 'none' | 'closed'

const CLOSED = new Set(['resolved', 'waived', 'dismissed', 'cured'])

export function isClosedViolation(status: string): boolean {
  return CLOSED.has(status)
}

export function cureBy(v: Pick<CureSource, 'notice_sent_at' | 'cure_period_days'>): Date | null {
  if (!v.notice_sent_at || v.cure_period_days === null || v.cure_period_days === undefined) return null
  return new Date(new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000)
}

export function cureState(v: CureSource, now: Date): CureState {
  if (isClosedViolation(v.status)) return 'closed'
  const due = cureBy(v)
  if (!due) return 'none'
  return due.getTime() < now.getTime() ? 'past' : 'pending'
}

const RANK: Record<CureState, number> = { past: 0, pending: 1, none: 2, closed: 3 }

/**
 * Most urgent first: past cure (longest overdue first), then cure dates
 * coming up (soonest first), then open with no notice yet, then closed —
 * the last two newest first.
 */
export function sortByUrgency<T extends CureSource>(rows: readonly T[], now: Date): T[] {
  const created = (r: T) => (r.created_at ? new Date(r.created_at).getTime() : 0)
  return [...rows].sort((a, b) => {
    const sa = cureState(a, now)
    const sb = cureState(b, now)
    if (sa !== sb) return RANK[sa] - RANK[sb]
    if (sa === 'past' || sa === 'pending') return cureBy(a)!.getTime() - cureBy(b)!.getTime()
    return created(b) - created(a)
  })
}
