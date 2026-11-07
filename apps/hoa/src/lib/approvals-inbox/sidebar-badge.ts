import { timed } from '@/lib/perf/timing'
import { countPendingApprovals } from '@/lib/approvals-inbox/load'
import { approvalsBadge } from '@/lib/approvals-inbox/model'

type CountDb = Parameters<typeof countPendingApprovals>[0]

/** The sidebar's count badges, keyed by nav href. */
export type SidebarBadges = Record<string, string | null>

/**
 * The pending-approvals badge as a PROMISE the layout hands to the sidebar
 * without awaiting it. The count is about ten database reads; awaited in the
 * layout it held up the whole first paint for one small number. Started here,
 * streamed to the sidebar when it resolves, and never rejects: a failed count
 * is simply no badge (countPendingApprovals already reports a failed read as
 * unknown, never as 0).
 */
export function sidebarBadges(db: CountDb, orgId: string): Promise<SidebarBadges> {
  return timed('layout', 'layout.approvalsBadge', () => countPendingApprovals(db, orgId)).then(
    (counts) => ({ '/approvals': approvalsBadge(counts) }),
    () => ({}),
  )
}
