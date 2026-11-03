/**
 * Closed-period guard. No write that posts, edits, voids or reverses a money
 * entry dated inside a CLOSED fiscal period may succeed (security audit
 * 2026-11-02). Every server-side money-write path calls this first;
 * apps/hoa/src/lib/accounting/period-guard-ratchet.test.ts fails when a new
 * one does not.
 *
 * Fails closed: if the period lookup errors, the write is refused. Only
 * status 'closed' blocks. 'closing' is the tombstone closePeriod holds while
 * it posts the closing entries themselves, so those must get through.
 *
 * Takes any client with .from(), so apps, jobs and workflows can all use it.
 */

export const CLOSED_PERIOD_MESSAGE =
  'That date is in a closed month. Reopen the month or use today\'s date.'

export const PERIOD_CHECK_FAILED_MESSAGE =
  'We could not check whether that date is in a closed month, so nothing was saved. Please try again.'

export type PeriodGuardResult = { ok: true } | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any }

const DAY = /^\d{4}-\d{2}-\d{2}$/

export async function assertPeriodOpen(
  db: AnyClient,
  input: { associationId: string; date: string; fiscalPeriodId?: string | null },
): Promise<PeriodGuardResult> {
  const date = typeof input.date === 'string' ? input.date.slice(0, 10) : ''
  if (!DAY.test(date)) return { ok: false, error: PERIOD_CHECK_FAILED_MESSAGE }

  let q = db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', input.associationId)
    .eq('status', 'closed')
  q = input.fiscalPeriodId
    ? q.or(`id.eq.${input.fiscalPeriodId},and(start_date.lte.${date},end_date.gte.${date})`)
    : q.lte('start_date', date).gte('end_date', date)

  let res: { data: unknown; error: unknown } | null = null
  try {
    res = await q.limit(1)
  } catch {
    return { ok: false, error: PERIOD_CHECK_FAILED_MESSAGE }
  }
  if (!res || res.error || !Array.isArray(res.data)) return { ok: false, error: PERIOD_CHECK_FAILED_MESSAGE }
  return res.data.length > 0 ? { ok: false, error: CLOSED_PERIOD_MESSAGE } : { ok: true }
}
