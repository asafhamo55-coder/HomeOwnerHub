/** Search and type filter for the board document library. Pure, no I/O. */

export const LIBRARY_TYPES = ['ccr', 'bylaws', 'rules', 'minutes', 'other'] as const
export type LibraryType = (typeof LIBRARY_TYPES)[number]

export interface FilterableDoc {
  name: string
  type: string
}

export function parseLibraryType(raw: string | null | undefined): LibraryType | null {
  return (LIBRARY_TYPES as readonly string[]).includes(raw ?? '') ? (raw as LibraryType) : null
}

/** Case-insensitive, every whitespace-separated term must appear in the name. */
export function matchesQuery(name: string, query: string | null | undefined): boolean {
  const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const hay = name.toLowerCase()
  return terms.every((t) => hay.includes(t))
}

/** Rows matching the query (any type). Chip counts are taken from this set. */
export function searchDocs<T extends FilterableDoc>(docs: readonly T[], query: string | null | undefined): T[] {
  return docs.filter((d) => matchesQuery(d.name, query))
}

function normalizeType(t: string): LibraryType {
  return (LIBRARY_TYPES as readonly string[]).includes(t) ? (t as LibraryType) : 'other'
}

export function filterDocs<T extends FilterableDoc>(
  docs: readonly T[],
  query: string | null | undefined,
  type: LibraryType | null,
): T[] {
  return searchDocs(docs, query).filter((d) => !type || normalizeType(d.type) === type)
}

/** Counts per chip for the searched set; `all` is the searched total. */
export function typeCounts(searched: readonly FilterableDoc[]): Record<LibraryType, number> & { all: number } {
  const counts = { all: searched.length, ccr: 0, bylaws: 0, rules: 0, minutes: 0, other: 0 }
  for (const d of searched) counts[normalizeType(d.type)] += 1
  return counts
}
