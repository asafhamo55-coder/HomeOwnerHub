// Shared zod field builders for route bodies (RC-8). Every string and array
// in a request schema has an upper bound; dates are validated as real
// calendar dates before they can reach a Postgres `date` column (C-11).

import { z } from 'zod'
import { MAX_SHORT_TEXT } from './limits'

/** Trimmed string with a mandatory upper bound. */
export function zText(max: number = MAX_SHORT_TEXT, min = 0) {
  return z.string().trim().min(min).max(max)
}

export const zUuid = z.string().uuid()

/** `YYYY-MM-DD` that is a real calendar date (2026-02-29 is refused). */
export const zDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number]
    const dt = new Date(Date.UTC(y, m - 1, d))
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'That date does not exist.')

/** ISO 8601 timestamp with an explicit offset (`Z` or `+hh:mm`). */
export const zIsoDateTime = z.string().datetime({ offset: true })

/** Money on the wire: integer cents, non-negative, ≤ $1B. */
export const zCents = z.number().int().min(0).max(100_000_000_000)
