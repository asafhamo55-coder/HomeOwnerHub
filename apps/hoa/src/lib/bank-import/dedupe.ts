// BL-144: which statement rows are new. Pure.
//
// A row is the same transaction as one already stored when the date, the
// amount (to the cent) and the description match. The description is
// compared loosely (case, punctuation and spacing ignored), against both
// the stored memo and merchant, since a Plaid row may carry either.
//
// Matching counts, it doesn't just test membership. Two identical $25.00
// checks on the same day are two transactions: if one is stored and the
// file has both, one is new. That also makes re-uploading an overlapping
// statement safe: every row already stored is used up once, and only the
// rest is imported.

import type { ParsedTxn } from './parse'

export interface ExistingTxn {
  posted_date: string
  /** bank_transactions.amount: numeric dollars, as PostgREST returns it. */
  amount: number | string
  memo: string | null
  merchant: string | null
}

export function normalizeDescription(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Integer cents from a stored numeric(14,2), without float drift. */
export function storedCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

export function dedupeKey(postedDate: string, amountCents: number, description: string | null | undefined): string {
  return `${postedDate}|${amountCents}|${normalizeDescription(description)}`
}

export interface ImportPlan {
  toInsert: ParsedTxn[]
  duplicates: ParsedTxn[]
}

export function planImport(rows: readonly ParsedTxn[], existing: readonly ExistingTxn[]): ImportPlan {
  // key → indices of stored rows that could match it, not yet used.
  const pool = new Map<string, number[]>()
  existing.forEach((e, i) => {
    const cents = storedCents(e.amount)
    const keys = new Set([e.memo, e.merchant, [e.merchant, e.memo].filter(Boolean).join(' ')].map((d) => dedupeKey(e.posted_date, cents, d)))
    for (const k of keys) {
      const list = pool.get(k)
      if (list) list.push(i)
      else pool.set(k, [i])
    }
  })
  const used = new Set<number>()
  const toInsert: ParsedTxn[] = []
  const duplicates: ParsedTxn[] = []
  for (const r of rows) {
    const candidates = pool.get(dedupeKey(r.postedDate, r.amountCents, r.description))
    const hit = candidates?.find((i) => !used.has(i))
    if (hit !== undefined) {
      used.add(hit)
      duplicates.push(r)
    } else toInsert.push(r)
  }
  return { toInsert, duplicates }
}

/** The date span a file covers, to read only the stored rows that could match. */
export function dateSpan(rows: readonly ParsedTxn[]): { from: string; to: string } | null {
  if (rows.length === 0) return null
  let from = rows[0]!.postedDate
  let to = from
  for (const r of rows) {
    if (r.postedDate < from) from = r.postedDate
    if (r.postedDate > to) to = r.postedDate
  }
  return { from, to }
}
