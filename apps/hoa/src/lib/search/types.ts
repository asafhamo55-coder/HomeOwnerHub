// Shared by the server search (records.ts) and the palette client
// (client.ts). Plain module: no server or React imports.

export type RecordType =
  | 'owner'
  | 'property'
  | 'violation'
  | 'arc'
  | 'ticket'
  | 'thread'
  | 'meeting'
  | 'motion'
  | 'document'
  | 'vendor'

export interface RecordHit {
  id: string
  type: RecordType
  label: string
  /** Muted text after the label: where the record lives (address, document kind). */
  hint: string | null
  /**
   * What tells this row apart from its neighbours — status and day
   * ("Open · Oct 3"). The palette keeps it visible when the label and hint
   * truncate, so three violations on one lot never read as one row (BL-060).
   */
  detail: string | null
  href: string
}

export interface RecordGroup {
  type: RecordType
  label: string
  items: RecordHit[]
}

export interface RecordSearchResult {
  groups: RecordGroup[]
  /** Types whose query failed. Their absence from `groups` is NOT "no matches". */
  failed: RecordType[]
}

/** Display order of the groups, and their headings. */
export const RECORD_TYPES: readonly RecordType[] = [
  'owner',
  'property',
  'violation',
  'arc',
  'ticket',
  'thread',
  'meeting',
  'motion',
  'document',
  'vendor',
]

export const RECORD_GROUP_LABEL: Record<RecordType, string> = {
  owner: 'Owners',
  property: 'Properties',
  violation: 'Violations',
  arc: 'ARC requests',
  ticket: 'Tickets',
  thread: 'Inbox',
  meeting: 'Meetings',
  motion: 'Motions',
  document: 'Documents',
  vendor: 'Vendors',
}
