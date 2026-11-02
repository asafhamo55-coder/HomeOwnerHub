/**
 * BL-036: autopay failures that arrive AFTER the daily run (a bank debit
 * that comes back days later, a card whose decline webhook is the first we
 * hear of it). The daily run already counts the failures it sees itself; this
 * counts the ones the webhook sees, so two returned payments in a row pause
 * autopay no matter which path reported them (design 4.4).
 *
 * Exactly once per attempt: the daily run and this file both leave an
 * `autopay.failure_counted` audit row naming the attempt, and this file
 * skips an attempt that already has one. Increment first, marker second: a
 * crash between them double-counts on redelivery, which errs toward pausing
 * (safe for the owner) rather than toward charging an account that keeps
 * failing. Not a 'use server' file. Ids and counts only in logs.
 */

export const FAILURE_COUNTED_ACTION = 'autopay.failure_counted'
export const AUTOPAY_PAUSE_AT = 2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export type FailureCountOutcome = 'counted' | 'paused' | 'not_autopay' | 'not_failed' | 'already_counted' | 'enrollment_gone'

export async function countAutopayFailure(db: Db, paymentIntentId: string): Promise<FailureCountOutcome> {
  const { data: op, error } = await db
    .from('online_payments')
    .select('id, organization_id, autopay_enrollment_id, status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error(`autopay failure: read attempt failed (${error.code ?? 'unknown'})`)
  if (!op || !op.autopay_enrollment_id) return 'not_autopay'
  // Only a payment that really ended as failed. A stale or ignored event leaves the status alone.
  if (op.status !== 'failed') return 'not_failed'

  const marked = await db
    .from('audit_log')
    .select('id')
    .eq('org_id', op.organization_id)
    .eq('action', FAILURE_COUNTED_ACTION)
    .contains('metadata', { attempt_id: op.id })
    .limit(1)
  if (marked.error) throw new Error(`autopay failure: read marker failed (${marked.error.code ?? 'unknown'})`)
  if (Array.isArray(marked.data) && marked.data.length > 0) return 'already_counted'

  const { data: enr, error: eerr } = await db
    .from('autopay_enrollments')
    .select('id, status, consecutive_failures')
    .eq('id', op.autopay_enrollment_id)
    .maybeSingle()
  if (eerr) throw new Error(`autopay failure: read enrollment failed (${eerr.code ?? 'unknown'})`)
  if (!enr) return 'enrollment_gone'

  const next = Number(enr.consecutive_failures) + 1
  const pause = next >= AUTOPAY_PAUSE_AT && enr.status === 'active'
  const upd = await db
    .from('autopay_enrollments')
    .update({ consecutive_failures: next, ...(pause ? { status: 'paused' } : {}), updated_at: new Date().toISOString() })
    .eq('id', enr.id)
    // Compare-and-set: a concurrent change wins and this retries on redelivery.
    .eq('consecutive_failures', enr.consecutive_failures)
    .select('id')
  if (upd.error) throw new Error(`autopay failure: update failed (${upd.error.code ?? 'unknown'})`)
  if (!Array.isArray(upd.data) || upd.data.length === 0) throw new Error('autopay failure: enrollment changed, retry')

  const audits = [
    { action: FAILURE_COUNTED_ACTION, metadata: { attempt_id: op.id, consecutive_failures: next } },
    ...(pause ? [{ action: 'autopay.paused', metadata: { attempt_id: op.id, reason: 'two_failures' } }] : []),
  ]
  for (const a of audits) {
    const ins = await db.from('audit_log').insert({
      org_id: op.organization_id,
      entity_type: 'autopay_enrollment',
      entity_id: enr.id,
      action: a.action,
      metadata: { enrollment_id: enr.id, ...a.metadata },
    })
    if (ins.error) throw new Error(`autopay failure: audit failed (${ins.error.code ?? 'unknown'})`)
  }
  return pause ? 'paused' : 'counted'
}

/** A payment that finally posted ends the streak (an ACH debit succeeds days after the run). */
export async function resetAutopayFailures(db: Db, attemptId: string): Promise<void> {
  const { data: op, error } = await db
    .from('online_payments')
    .select('autopay_enrollment_id')
    .eq('id', attemptId)
    .maybeSingle()
  if (error) throw new Error(`autopay reset: read failed (${error.code ?? 'unknown'})`)
  if (!op?.autopay_enrollment_id) return
  const upd = await db
    .from('autopay_enrollments')
    .update({ consecutive_failures: 0, updated_at: new Date().toISOString() })
    .eq('id', op.autopay_enrollment_id)
    .gt('consecutive_failures', 0)
  if (upd.error) throw new Error(`autopay reset: update failed (${upd.error.code ?? 'unknown'})`)
}
