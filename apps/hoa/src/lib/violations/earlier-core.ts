// "Earlier violations at this home". Pure: ordering, the cap and the wording.
// No server imports, so the client wizard can use it.

export interface EarlierViolation {
  id: string
  violation_type: string | null
  status: string
  created_at: string | null
  fine_amount: number | null
}

/** The violation page lists at most this many, then links to the home's full list. */
export const EARLIER_SHOWN = 10

const sameCategory = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = (a ?? '').trim().toLowerCase()
  return x !== '' && x === (b ?? '').trim().toLowerCase()
}

/** Same-category rows first, then most recent first. Ties fall back to id so the order is stable. */
export function orderEarlier(rows: readonly EarlierViolation[], category: string | null | undefined): EarlierViolation[] {
  return [...rows].sort((a, b) => {
    const ca = sameCategory(a.violation_type, category) ? 0 : 1
    const cb = sameCategory(b.violation_type, category) ? 0 : 1
    if (ca !== cb) return ca - cb
    const da = a.created_at ?? ''
    const db = b.created_at ?? ''
    if (da !== db) return da < db ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** The rows to show, and how many more there are. */
export function earlierPage(
  rows: readonly EarlierViolation[],
  category: string | null | undefined,
  cap: number = EARLIER_SHOWN,
): { shown: EarlierViolation[]; total: number; hidden: number } {
  const ordered = orderEarlier(rows, category)
  const shown = ordered.slice(0, cap)
  return { shown, total: ordered.length, hidden: ordered.length - shown.length }
}

export interface EarlierCounts {
  total: number
  /** Violation type -> count, lower-cased and trimmed. */
  byType: Record<string, number>
}

export function countEarlier(rows: readonly Pick<EarlierViolation, 'violation_type'>[]): EarlierCounts {
  const byType: Record<string, number> = {}
  for (const r of rows) {
    const k = (r.violation_type ?? '').trim().toLowerCase()
    if (k) byType[k] = (byType[k] ?? 0) + 1
  }
  return { total: rows.length, byType }
}

/**
 * "This home has 3 earlier violations (1 in this category)". The category
 * part appears only once a category is known. A home with none says so.
 */
export function earlierLine(counts: EarlierCounts, category?: string | null): string {
  const n = counts.total
  if (n === 0) return 'No earlier violations at this home.'
  const head = `This home has ${n} earlier violation${n === 1 ? '' : 's'}`
  const key = (category ?? '').trim().toLowerCase()
  return key ? `${head} (${counts.byType[key] ?? 0} in this category).` : `${head}.`
}
