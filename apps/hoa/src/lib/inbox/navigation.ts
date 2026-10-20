/**
 * Moving through the inbox without the mouse (BL-101 A3): j/k, and "Next"
 * after Approve and close. Pure, so the order rules are unit-tested.
 */

import type { InboxFilter, InboxOwnerFilter } from './queries'

/** The thread before and after `currentId` in the list as displayed. */
export function neighbours(
  ids: readonly string[],
  currentId: string,
): { prevId: string | null; nextId: string | null } {
  const index = ids.indexOf(currentId)
  if (index === -1) return { prevId: null, nextId: ids[0] ?? null }
  return { prevId: ids[index - 1] ?? null, nextId: ids[index + 1] ?? null }
}

/**
 * The thread to open after this one is answered: the next one down the
 * needs-reply list, else the first one above it, never the current thread.
 * `needsReplyIds` is that list in display order (newest first).
 */
export function nextNeedingReply(needsReplyIds: readonly string[], currentId: string): string | null {
  const index = needsReplyIds.indexOf(currentId)
  if (index === -1) return needsReplyIds[0] ?? null
  return needsReplyIds[index + 1] ?? needsReplyIds.find((id) => id !== currentId) ?? null
}

/** `?filter=…&owner=…&page=…`, leaving out defaults so URLs stay short. */
export function inboxQuery(args: { filter: InboxFilter; owner?: InboxOwnerFilter; page?: number }): string {
  const params = new URLSearchParams({ filter: args.filter })
  if (args.owner && args.owner !== 'all') params.set('owner', args.owner)
  if (args.page && args.page > 1) params.set('page', String(args.page))
  return `?${params.toString()}`
}

export const INBOX_OWNER_FILTERS: Array<{ key: InboxOwnerFilter; label: string }> = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'all', label: 'All' },
]

export function parseOwnerFilter(value: string | undefined): InboxOwnerFilter {
  return value === 'mine' || value === 'unassigned' ? value : 'all'
}
