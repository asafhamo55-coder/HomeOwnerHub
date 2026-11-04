// Per-person limits on the community board (B5): new threads, replies and
// reports. Same ledger pattern as lib/online-payments/method-rate-limit.ts:
// one audit_log row per attempt, written BEFORE the real write, no new
// service and no migration. Fails CLOSED: if the ledger cannot be read or
// written the post is refused with a "try again" message, so a broken read
// never turns the spam guard off. Check-then-insert is not atomic, so a burst
// of parallel taps can slip a few over. Ids and codes only in rows and logs.

import { ApiRouteError } from '@/lib/api/errors'

export type BoardRateKind = 'thread' | 'reply' | 'report'

export const BOARD_RATE_ACTION: Record<BoardRateKind, string> = {
  thread: 'community_board.thread_started',
  reply: 'community_board.reply_posted',
  report: 'community_board.report_sent',
}

/** Generous for a neighbor, tight for a script. */
export const BOARD_RATE_WINDOWS: Record<BoardRateKind, readonly { seconds: number; max: number }[]> = {
  thread: [
    { seconds: 3600, max: 5 },
    { seconds: 86_400, max: 15 },
  ],
  reply: [
    { seconds: 600, max: 20 },
    { seconds: 86_400, max: 150 },
  ],
  report: [
    { seconds: 3600, max: 10 },
    { seconds: 86_400, max: 30 },
  ],
}

export type BoardRateDecision = { ok: true } | { ok: false; retryAfterSeconds: number; unavailable?: true }

/** `timestamps` are ms of earlier attempts, any order. Pure. */
export function decideBoardRate(kind: BoardRateKind, timestamps: readonly number[], nowMs: number): BoardRateDecision {
  const sorted = [...timestamps].sort((a, b) => b - a)
  let wait = 0
  for (const w of BOARD_RATE_WINDOWS[kind]) {
    const inside = sorted.filter((t) => nowMs - t < w.seconds * 1000)
    if (inside.length >= w.max) {
      wait = Math.max(wait, Math.ceil((inside[w.max - 1]! + w.seconds * 1000 - nowMs) / 1000))
    }
  }
  return wait > 0 ? { ok: false, retryAfterSeconds: wait } : { ok: true }
}

/** Plain words for an older reader. */
export function boardRateMessage(kind: BoardRateKind, retryAfterSeconds: number, unavailable = false): string {
  if (unavailable) return 'We could not save that just now. Please try again in a minute.'
  const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  const when =
    mins >= 120 ? `in about ${Math.ceil(mins / 60)} hours` : mins >= 60 ? 'in about an hour' : `in ${mins} minute${mins === 1 ? '' : 's'}`
  const what = kind === 'thread' ? 'topics' : kind === 'reply' ? 'replies' : 'reports'
  return `You have posted a lot of ${what} in a short time. Please try again ${when}.`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Checks the limit and, when allowed, records this attempt. */
export async function checkAndRecordBoardRate(
  db: Db,
  kind: BoardRateKind,
  who: { orgId: string; userId: string },
  nowMs: number = Date.now(),
): Promise<BoardRateDecision> {
  const action = BOARD_RATE_ACTION[kind]
  const longest = Math.max(...BOARD_RATE_WINDOWS[kind].map((w) => w.seconds))
  const since = new Date(nowMs - longest * 1000).toISOString()
  const { data, error } = await db
    .from('audit_log')
    .select('created_at')
    .eq('org_id', who.orgId)
    .eq('user_id', who.userId)
    .eq('action', action)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[community-board] rate-limit read failed', { code: error.code ?? null })
    return { ok: false, retryAfterSeconds: 60, unavailable: true }
  }
  const stamps = ((data ?? []) as Array<{ created_at: string }>).map((r) => Date.parse(r.created_at)).filter(Number.isFinite)
  const decision = decideBoardRate(kind, stamps, nowMs)
  if (!decision.ok) return decision
  const ins = await db.from('audit_log').insert({
    org_id: who.orgId,
    user_id: who.userId,
    action,
    entity_type: 'user',
    entity_id: who.userId,
    metadata: {},
  })
  if (ins?.error) {
    console.error('[community-board] rate-limit write failed', { code: ins.error.code ?? null })
    return { ok: false, retryAfterSeconds: 60, unavailable: true }
  }
  return { ok: true }
}

/** For routes: throws a 429 with a plain message when the person is over the limit. */
export async function enforceBoardRate(
  db: Db,
  kind: BoardRateKind,
  who: { orgId: string; userId: string },
): Promise<void> {
  const d = await checkAndRecordBoardRate(db, kind, who)
  if (d.ok) return
  throw new ApiRouteError(
    'rate_limited',
    boardRateMessage(kind, d.retryAfterSeconds, d.unavailable === true),
    { reason: d.unavailable ? 'limit_unavailable' : 'user_limit', retryAfterSeconds: d.retryAfterSeconds },
    { 'Retry-After': String(d.retryAfterSeconds) },
  )
}
