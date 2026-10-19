import { describe, expect, it, vi } from 'vitest'
import {
  checkAndRecordAiUsage,
  combineDecisions,
  decideFromTimestamps,
  decideWindow,
  describeWait,
  linkAiUsageToRun,
  rateLimitedError,
} from './rate-limit'
import { AI_RATE_LIMITS, DAY_MS, HOUR_MS } from './ai-limits'
import { withRoute } from './handler'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// Pinned clock: every test reasons from this instant.
const NOW = Date.parse('2026-10-18T12:00:00.000Z')
const MIN = 60 * 1000
const W = { limit: 3, windowMs: HOUR_MS }

describe('limiter math (pinned clock)', () => {
  it('under the limit is allowed', () => {
    expect(decideFromTimestamps(W, [], NOW)).toEqual({ ok: true })
    expect(decideFromTimestamps(W, [NOW - 5 * MIN, NOW - 1 * MIN], NOW)).toEqual({ ok: true })
  })

  it('at the limit is refused until the limit-th newest call ages out', () => {
    // newest three: -1, -10, -50 min → the -50 min one frees up in 10 min.
    const d = decideFromTimestamps(W, [NOW - 1 * MIN, NOW - 10 * MIN, NOW - 50 * MIN], NOW)
    expect(d).toEqual({ ok: false, retryAfterSeconds: 600 })
  })

  it('older calls than the limit-th newest do not lengthen the wait', () => {
    const d = decideFromTimestamps(W, [NOW - 1 * MIN, NOW - 2 * MIN, NOW - 3 * MIN, NOW - 30 * MIN, NOW - 59 * MIN], NOW)
    expect(d).toEqual({ ok: false, retryAfterSeconds: 57 * 60 })
  })

  it('calls outside the window do not count', () => {
    expect(decideFromTimestamps(W, [NOW - 1 * MIN, NOW - 2 * MIN, NOW - 61 * MIN], NOW)).toEqual({ ok: true })
  })

  it('a call exactly one window old has aged out', () => {
    expect(decideWindow(W, NOW - HOUR_MS, NOW)).toEqual({ ok: true })
  })

  it('rounds the wait up and never answers 0 seconds', () => {
    expect(decideWindow(W, NOW - HOUR_MS + 1, NOW)).toEqual({ ok: false, retryAfterSeconds: 1 })
    expect(decideWindow(W, NOW - HOUR_MS + 1500, NOW)).toEqual({ ok: false, retryAfterSeconds: 2 })
  })

  it('both windows full: the later one decides the scope and wait', () => {
    expect(combineDecisions({ ok: true }, { ok: true })).toEqual({ ok: true })
    expect(combineDecisions({ ok: false, retryAfterSeconds: 60 }, { ok: true })).toEqual({ ok: false, scope: 'user', retryAfterSeconds: 60 })
    expect(combineDecisions({ ok: true }, { ok: false, retryAfterSeconds: 90 })).toEqual({ ok: false, scope: 'org', retryAfterSeconds: 90 })
    expect(combineDecisions({ ok: false, retryAfterSeconds: 60 }, { ok: false, retryAfterSeconds: 7200 })).toMatchObject({ scope: 'org', retryAfterSeconds: 7200 })
  })

  it('says the wait in words', () => {
    expect(describeWait(1)).toBe('a minute')
    expect(describeWait(600)).toBe('about 10 minutes')
    expect(describeWait(3600)).toBe('about 60 minutes')
    expect(describeWait(3 * 3600 - 10)).toBe('about 3 hours')
  })

  it('defaults: every bucket has an hourly per-user and a daily per-org window', () => {
    for (const cfg of Object.values(AI_RATE_LIMITS)) {
      expect(cfg.perUser.windowMs).toBe(HOUR_MS)
      expect(cfg.perOrg.windowMs).toBe(DAY_MS)
      expect(cfg.perOrg.limit).toBeGreaterThan(cfg.perUser.limit)
    }
    expect(AI_RATE_LIMITS.arc_precheck.perUser.limit).toBe(10)
  })
})

describe('429 envelope', () => {
  it('rate_limited, reason, retryAfterSeconds, a Retry-After header and a friendly message', async () => {
    const route = withRoute('t', async () => {
      throw rateLimitedError('arc_precheck', { ok: false, scope: 'user', retryAfterSeconds: 600 })
    })
    const res = await route(new Request('http://x'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('600')
    expect(await res.json()).toEqual({
      error: {
        code: 'rate_limited',
        reason: 'user_limit',
        retryAfterSeconds: 600,
        message:
          'You’ve reached the limit of 10 rules checks an hour. Try again in about 10 minutes. You can still submit your application.',
      },
    })
  })

  it('the org window names the community, not the person', () => {
    const e = rateLimitedError('ask_docs', { ok: false, scope: 'org', retryAfterSeconds: 5 * 3600 })
    expect(e.status).toBe(429)
    expect(e.extra).toMatchObject({ reason: 'org_limit' })
    expect(e.publicMessage).toBe('Your community has reached its limit of 500 questions a day. Try again in about 5 hours.')
  })
})

// ─── Ledger against an in-memory audit_log ─────────────────────────────

interface Row {
  id: string
  action: string
  org_id: string
  user_id: string
  created_at: string
  entity_type?: string | null
  entity_id?: string | null
}

function fakeDb(rows: Row[], opts: { readError?: unknown; insertError?: unknown } = {}) {
  const reads: Array<Array<[string, string, unknown]>> = []
  const updates: Array<{ patch: Record<string, unknown>; id: unknown }> = []
  let seq = 0
  const db = {
    from(table: string) {
      expect(table).toBe('audit_log')
      const filters: Array<[string, string, unknown]> = []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), q),
        gte: (c: string, v: unknown) => (filters.push(['gte', c, v]), q),
        order: (c: string, o: { ascending: boolean }) => (filters.push(['order', c, o.ascending]), q),
        range: async (from: number, to: number) => {
          reads.push(filters)
          if (opts.readError) return { data: null, error: opts.readError }
          const matching = rows
            .filter((r) =>
              filters.every(([op, c, v]) =>
                op === 'eq' ? (r as unknown as Record<string, unknown>)[c] === v : op === 'gte' ? r.created_at >= (v as string) : true,
              ),
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
          return { data: matching.slice(from, to + 1).map((r) => ({ created_at: r.created_at })), error: null }
        },
        insert: (row: Omit<Row, 'id' | 'created_at'>) => ({
          select: () => ({
            single: async () => {
              if (opts.insertError) return { data: null, error: opts.insertError }
              const id = `usage-${++seq}`
              rows.push({ ...row, id, created_at: new Date(NOW).toISOString() } as Row)
              return { data: { id }, error: null }
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: unknown) => (updates.push({ patch, id }), { error: null }),
        }),
      }
      return q
    },
  }
  return { db: db as never, reads, updates, rows }
}

const at = (minsAgo: number) => new Date(NOW - minsAgo * MIN).toISOString()
const usage = (n: number, who: { org: string; user: string }, minsAgo: (i: number) => number, action = 'ai.usage.arc_precheck'): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${who.user}${i}`, action, org_id: who.org, user_id: who.user, created_at: at(minsAgo(i)) }))

const WHO = { orgId: 'org-1', userId: 'user-1' }
const clock = () => NOW

describe('checkAndRecordAiUsage (ledger in audit_log)', () => {
  it('under both limits: records one usage row with ids only, and returns its id', async () => {
    const f = fakeDb(usage(3, { org: 'org-1', user: 'user-1' }, (i) => i * 5))
    const grant = await checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })
    expect(grant).toEqual({ usageId: 'usage-1' })
    const added = f.rows.at(-1)!
    expect(added).toMatchObject({ action: 'ai.usage.arc_precheck', org_id: 'org-1', user_id: 'user-1' })
    expect(Object.keys(added).sort()).toEqual(['action', 'created_at', 'id', 'metadata', 'org_id', 'user_id'])
  })

  it('reads the user window by user + org + bucket, the org window by org + bucket, from the pinned clock', async () => {
    const f = fakeDb([])
    await checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })
    expect(f.reads).toHaveLength(2)
    expect(f.reads[0]).toEqual(
      expect.arrayContaining([
        ['eq', 'action', 'ai.usage.arc_precheck'],
        ['eq', 'org_id', 'org-1'],
        ['eq', 'user_id', 'user-1'],
        ['gte', 'created_at', at(60)],
      ]),
    )
    expect(f.reads[1]!.some(([, c]) => c === 'user_id')).toBe(false)
    expect(f.reads[1]).toEqual(expect.arrayContaining([['gte', 'created_at', at(24 * 60)]]))
  })

  it('the 11th pre-check in an hour by one resident is 429 with the wait until the oldest ages out', async () => {
    // 10 calls, one every 5 minutes, the oldest 45 minutes ago → 15 minutes to wait.
    const f = fakeDb(usage(10, { org: 'org-1', user: 'user-1' }, (i) => i * 5))
    const err = await checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', status: 429, extra: { reason: 'user_limit', retryAfterSeconds: 900 } })
    expect(err.headers).toEqual({ 'Retry-After': '900' })
    expect(f.rows).toHaveLength(10) // nothing recorded for a refused call
  })

  it('another resident in the same org is not affected by one resident’s hourly limit', async () => {
    const f = fakeDb(usage(10, { org: 'org-1', user: 'user-2' }, (i) => i * 5))
    await expect(checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
  })

  it('other buckets do not count against this one', async () => {
    const f = fakeDb(usage(10, { org: 'org-1', user: 'user-1' }, (i) => i * 5, 'ai.usage.ask_docs'))
    await expect(checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
  })

  it('the org’s daily ceiling applies across residents', async () => {
    // 200 calls by 200 different residents over the last 20 hours (one every 6 min).
    const rows = Array.from({ length: 200 }, (_, i) => usage(1, { org: 'org-1', user: `u${i}` }, () => i * 6)[0]!)
    const f = fakeDb(rows)
    const err = await checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock }).catch((e) => e)
    // oldest counted call is 199*6 = 1194 min ago → frees at 1440 → 246 min.
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit', retryAfterSeconds: 246 * 60 } })
  })

  it('another org’s usage never counts', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => usage(1, { org: 'org-2', user: `u${i}` }, () => i)[0]!)
    await expect(checkAndRecordAiUsage('arc_precheck', WHO, { db: fakeDb(rows).db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
  })

  it('a ledger read failure fails open and logs the code only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeDb([], { readError: { code: '57014', message: 'canceling statement; user jane@example.com' } })
    await expect(checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
    expect(JSON.stringify(spy.mock.calls)).toContain('57014')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@')
    spy.mockRestore()
  })

  it('a ledger write failure fails open with no usage id', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fakeDb([], { insertError: { code: '42501', message: 'denied' } })
    await expect(checkAndRecordAiUsage('arc_precheck', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: null })
    spy.mockRestore()
  })
})

describe('linkAiUsageToRun', () => {
  it('points the usage row at the ai_runs row', async () => {
    const f = fakeDb([])
    await linkAiUsageToRun('usage-9', 'run-1', { db: f.db })
    expect(f.updates).toEqual([{ patch: { entity_type: 'ai_run', entity_id: 'run-1' }, id: 'usage-9' }])
  })

  it('does nothing without a usage id', async () => {
    const f = fakeDb([])
    await linkAiUsageToRun(null, 'run-1', { db: f.db })
    expect(f.updates).toEqual([])
  })
})

describe('resident_assistant bucket (BL-096): hourly + daily per person, daily per org', () => {
  it('limits are 20/hour and 100/day per user with a per-org daily cap', () => {
    const cfg = AI_RATE_LIMITS.resident_assistant
    expect(cfg.perUser).toEqual({ limit: 20, windowMs: HOUR_MS })
    expect(cfg.perUserDaily).toEqual({ limit: 100, windowMs: DAY_MS })
    expect(cfg.perOrg.windowMs).toBe(DAY_MS)
    expect(cfg.perOrg.limit).toBeGreaterThan(cfg.perUserDaily!.limit)
  })

  const action = 'ai.usage.resident_assistant'

  it('the 21st message in an hour is refused on the hourly window', async () => {
    const f = fakeDb(usage(20, { org: 'org-1', user: 'user-1' }, (i) => i * 2, action))
    const err = await checkAndRecordAiUsage('resident_assistant', WHO, { db: f.db, now: clock }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'user_limit' } })
    expect(err.publicMessage).toContain('20 assistant messages an hour')
    expect(f.reads).toHaveLength(3)
  })

  it('100 messages spread over the day are refused on the daily window, with the daily wording', async () => {
    // One every 12 minutes: never 20 in an hour, but 100 in 20 hours.
    const f = fakeDb(usage(100, { org: 'org-1', user: 'user-1' }, (i) => 61 + i * 12, action))
    const err = await checkAndRecordAiUsage('resident_assistant', WHO, { db: f.db, now: clock }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'user_limit' } })
    expect(err.publicMessage).toContain('100 assistant messages a day')
  })

  it('under every window: allowed and recorded', async () => {
    const f = fakeDb(usage(50, { org: 'org-1', user: 'user-1' }, (i) => 61 + i * 12, action))
    await expect(checkAndRecordAiUsage('resident_assistant', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
  })
})
