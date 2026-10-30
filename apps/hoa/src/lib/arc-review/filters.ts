// The ARC list's status views, shared by the /arc page and its CSV export so
// a status filter means the same rows in both. Not a server file.

import type { ArcStatus } from '@/lib/board-review'

/** Default view is the work queue: what still needs a board decision. */
export const ARC_FILTERS = {
  pending: { label: 'Needs decision', statuses: ['submitted', 'in_review'] },
  approved: { label: 'Approved', statuses: ['approved'] },
  denied: { label: 'Denied', statuses: ['denied'] },
  withdrawn: { label: 'Withdrawn', statuses: ['withdrawn'] },
  all: { label: 'All', statuses: null },
} as const satisfies Record<string, { label: string; statuses: readonly ArcStatus[] | null }>

export type ArcFilter = keyof typeof ARC_FILTERS

/** An unknown or missing value is the default work queue, as on the page. */
export function parseArcFilter(raw: string | null | undefined): ArcFilter {
  return raw && Object.prototype.hasOwnProperty.call(ARC_FILTERS, raw) ? (raw as ArcFilter) : 'pending'
}
