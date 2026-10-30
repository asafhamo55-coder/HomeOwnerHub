import { sameDayLastYear } from '../../resident-ledger'

// The period a board-side owner statement covers. Pure: no Next, no database.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date in 'YYYY-MM-DD' form, else null (so 2025-02-30 is rejected). */
export function parseDay(v: string | undefined): string | null {
  const m = v ? DAY.exec(v) : null
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? v! : null
}

export interface StatementRange {
  from: string
  to: string
}

/**
 * `?from=&to=` when they are real dates (an inverted pair is swapped); any
 * other input falls back to the last 12 months ending on the association's
 * today. A missing `to` means today, a missing `from` means a year before `to`.
 */
export function resolveStatementRange(
  params: { from?: string | undefined; to?: string | undefined },
  today: string,
): StatementRange {
  const f = parseDay(params.from)
  const t = parseDay(params.to)
  const to = t ?? today
  const from = f ?? sameDayLastYear(to)
  return from <= to ? { from, to } : { from: to, to: from }
}
