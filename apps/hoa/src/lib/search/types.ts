// Shared by the server search (records.ts) and the palette client
// (client.ts). Plain module: no server or React imports.

export type RecordType = 'owner' | 'property' | 'violation' | 'arc' | 'ticket' | 'thread' | 'vendor'

export interface RecordHit {
  id: string
  type: RecordType
  label: string
  hint: string | null
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
export const RECORD_TYPES: readonly RecordType[] = ['owner', 'property', 'violation', 'arc', 'ticket', 'thread', 'vendor']

export const RECORD_GROUP_LABEL: Record<RecordType, string> = {
  owner: 'Owners',
  property: 'Properties',
  violation: 'Violations',
  arc: 'ARC requests',
  ticket: 'Tickets',
  thread: 'Inbox',
  vendor: 'Vendors',
}
