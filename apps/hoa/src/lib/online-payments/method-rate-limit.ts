/**
 * Design 6.6: a card-testing guard on adding a saved method. A person who
 * keeps starting "add a card" is either stuck or probing stolen cards, and
 * every start costs a Stripe SetupIntent. Limits are per person (not per
 * association), counted from audit_log rows the action writes BEFORE it calls
 * Stripe, so a failed call still counts. Same ledger pattern as
 * lib/api/rate-limit.ts, no new service, no migration.
 *
 * Accepted trade-offs (as in that file): check-then-insert is not atomic, so
 * a burst of parallel taps can slip a few over. A failed ledger read or write
 * FAILS CLOSED (logged by code): adding a saved method is not paying (Pay now
 * never goes through here), and failing open would let a broken read silently
 * turn the card-testing guard off with nobody noticing.
 * Not a 'use server' module. No names or emails in rows or logs.
 */

export const ADD_METHOD_ACTION = 'payment_method.add_started'

/** At most 5 starts an hour and 10 a day. Generous for a person, tight for a script. */
export const ADD_METHOD_WINDOWS = [
  { seconds: 3600, max: 5 },
  { seconds: 86_400, max: 10 },
] as const

export type AddMethodDecision = { ok: true } | { ok: false; retryAfterSeconds: number; unavailable?: true }

/** `timestamps` are ms of earlier starts, in any order. Pure. */
export function decideAddMethod(timestamps: readonly number[], nowMs: number): AddMethodDecision {
  const sorted = [...timestamps].sort((a, b) => b - a)
  let wait = 0
  for (const w of ADD_METHOD_WINDOWS) {
    const inside = sorted.filter((t) => nowMs - t < w.seconds * 1000)
    if (inside.length >= w.max) {
      // The window frees up when its max-th newest start ages out.
      const frees = Math.ceil((inside[w.max - 1]! + w.seconds * 1000 - nowMs) / 1000)
      wait = Math.max(wait, frees)
    }
  }
  return wait > 0 ? { ok: false, retryAfterSeconds: wait } : { ok: true }
}

/** Plain words for an older reader. */
export function addMethodLimitMessage(retryAfterSeconds: number): string {
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  const when =
    mins >= 120 ? `in about ${Math.ceil(mins / 60)} hours` : mins >= 60 ? 'in about an hour' : `in ${mins} minute${mins === 1 ? '' : 's'}`
  return `You have tried to add a payment method several times. For your safety, please try again ${when}.`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Checks the limit and, when allowed, records this start. */
export async function checkAndRecordAddMethod(
  db: Db,
  who: { orgId: string; userId: string },
  nowMs: number = Date.now(),
): Promise<AddMethodDecision> {
  const longest = Math.max(...ADD_METHOD_WINDOWS.map((w) => w.seconds))
  const since = new Date(nowMs - longest * 1000).toISOString()
  const { data, error } = await db
    .from('audit_log')
    .select('created_at')
    .eq('org_id', who.orgId)
    .eq('user_id', who.userId)
    .eq('action', ADD_METHOD_ACTION)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[saved-methods] rate-limit read failed', { code: error.code ?? null })
    return { ok: false, retryAfterSeconds: 60, unavailable: true }
  }
  const stamps = ((data ?? []) as Array<{ created_at: string }>).map((r) => Date.parse(r.created_at)).filter(Number.isFinite)
  const decision = decideAddMethod(stamps, nowMs)
  if (!decision.ok) return decision
  const ins = await db.from('audit_log').insert({
    org_id: who.orgId,
    user_id: who.userId,
    action: ADD_METHOD_ACTION,
    entity_type: 'user',
    entity_id: who.userId,
    metadata: {},
  })
  const insErr = ins?.error
  if (insErr) {
    console.error('[saved-methods] rate-limit write failed', { code: insErr.code ?? null })
    return { ok: false, retryAfterSeconds: 60, unavailable: true }
  }
  return { ok: true }
}
