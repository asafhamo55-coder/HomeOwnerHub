import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkAndRecordAiUsage,
  combineDecisions,
  decideFromTimestamps,
  decideWindow,
  describeWait,
  linkAiUsageToRun,
  loadAiBudget,
  loadAiTier,
  notOnPlanError,
  rateLimitedError,
} from './rate-limit'
import { AI_RATE_LIMITS, DAY_MS, HOUR_MS, type AiBudget } from './ai-limits'
import { AI_PAUSED_MESSAGE, aiKillSwitchOn, readMonthlyAiSpend, resetAiSpendCache } from './ai-spend'
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

function fakeDb(
  rows: Row[],
  opts: {
    readError?: unknown
    insertError?: unknown
    /** BL-104: the orgs row the tier is read from; absent = not found (base ceilings). */
    org?: { plan: string; doors_count: number | null }
    orgError?: unknown
    /** Homes on file (hoa_properties count). */
    units?: number
  } = {},
) {
  const reads: Array<Array<[string, string, unknown]>> = []
  const updates: Array<{ patch: Record<string, unknown>; id: unknown }> = []
  let seq = 0
  const db = {
    from(table: string) {
      if (table === 'orgs') {
        const o = {
          select: () => o,
          eq: () => o,
          maybeSingle: async () => (opts.orgError ? { data: null, error: opts.orgError } : { data: opts.org ?? null, error: null }),
        }
        return o
      }
      if (table === 'hoa_properties') {
        return { select: () => ({ eq: async () => ({ count: opts.units ?? 0, error: null }) }) }
      }
      expect(table).toBe('audit_log')
      const filters: Array<[string, string, unknown]> = []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), q),
        in: (c: string, v: unknown) => (filters.push(['in', c, v]), q),
        gte: (c: string, v: unknown) => (filters.push(['gte', c, v]), q),
        order: (c: string, o: { ascending: boolean }) => (filters.push(['order', c, o.ascending]), q),
        range: async (from: number, to: number) => {
          reads.push(filters)
          if (opts.readError) return { data: null, error: opts.readError }
          const matching = rows
            .filter((r) =>
              filters.every(([op, c, v]) =>
                op === 'eq'
                  ? (r as unknown as Record<string, unknown>)[c] === v
                  : op === 'in'
                    ? (v as unknown[]).includes((r as unknown as Record<string, unknown>)[c])
                    : op === 'gte'
                      ? r.created_at >= (v as string)
                      : true,
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

// ─── BL-104: ceilings by plan and band ─────────────────────────────────

describe('BL-104: band ceilings only for the new plans; today’s limits for everyone else', () => {
  const askRows = (n: number) => usage(n, { org: 'org-1', user: 'other' }, (i) => i, 'ai.usage.ask_docs')

  it('grandfathered $4.99/door org (plan monthly) keeps today’s 500 doc questions a day, flag on', async () => {
    const f = fakeDb(askRows(499), { org: { plan: 'monthly', doors_count: 40 } })
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock })).resolves.toEqual({ usageId: 'usage-1' })
    const g = fakeDb(askRows(500), { org: { plan: 'monthly', doors_count: 40 } })
    const err = await checkAndRecordAiUsage('ask_docs', WHO, { db: g.db, now: clock }).catch((e) => e)
    expect(err.publicMessage).toContain('limit of 500 questions a day')
  })

  it('PRICING_V2 off: no orgs read at all (null tier, today’s limits)', async () => {
    const f = fakeDb([], { orgError: { code: 'should_not_be_read' } })
    await expect(loadAiTier(f.db, 'org-1', false)).resolves.toBeNull()
  })

  it('after the flip: a new-plan org gets its band, from the larger of declared doors and homes on file', async () => {
    const f = fakeDb([], { org: { plan: 'complete', doors_count: null }, units: 80 })
    await expect(loadAiTier(f.db, 'org-1', true)).resolves.toEqual({ plan: 'complete', band: '51-100' })
    const g = fakeDb([], { org: { plan: 'essentials', doors_count: 250 }, units: 10 })
    await expect(loadAiTier(g.db, 'org-1', true)).resolves.toEqual({ plan: 'essentials', band: '201-400' })
  })

  it('after the flip: grandfathered $4.99/door and pre-flip orgs keep today’s limits (null tier)', async () => {
    for (const plan of ['monthly', 'annual', 'legacy_per_door', 'pilot']) {
      const f = fakeDb([], { org: { plan, doors_count: 40 } })
      await expect(loadAiTier(f.db, 'org-1', true)).resolves.toBeNull()
    }
  })

  it('after the flip: an org with no subscription is on the trial footing', async () => {
    const f = fakeDb([], { org: { plan: 'free', doors_count: 300 } })
    await expect(loadAiTier(f.db, 'org-1', true)).resolves.toEqual({ plan: 'essentials', band: '1-50' })
  })

  it('an org row that cannot be read is null: today’s limits (fail open)', async () => {
    const f = fakeDb([], { orgError: { code: '57014' } })
    await expect(loadAiTier(f.db, 'org-1', true)).resolves.toBeNull()
  })

  it('a new-plan tier lowers the ceiling: Complete 1–50 ask_docs is 100/day', async () => {
    const f = fakeDb(askRows(100))
    const err = await checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, tier: { plan: 'complete', band: '1-50' } }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit' } })
    expect(err.publicMessage).toContain('limit of 100 questions a day')
  })

  it('an explicit tier wins over the orgs read', async () => {
    const f = fakeDb(askRows(50), { org: { plan: 'free', doors_count: 400 } })
    const err = await checkAndRecordAiUsage('ask_docs', WHO, {
      db: f.db,
      now: clock,
      tier: { plan: 'essentials', band: '1-50' },
    }).catch((e) => e)
    expect(err.publicMessage).toContain('limit of 50 questions a day')
  })

  it('board_ai and compose share one org ceiling, at the Complete level (200) for a legacy org', async () => {
    const rows = [
      ...usage(150, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.compose'),
      ...usage(50, { org: 'org-1', user: 'u-b' }, (i) => i, 'ai.usage.board_ai'),
    ]
    const f = fakeDb(rows, { org: { plan: 'annual', doors_count: 120 } })
    const err = await checkAndRecordAiUsage('board_ai', WHO, { db: f.db, now: clock }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit' } })
    expect(err.publicMessage).toContain('limit of 200 board AI drafts a day')
    // The org window reads both actions; the user window only this bucket's.
    expect(f.reads[1]).toEqual(expect.arrayContaining([['in', 'action', ['ai.usage.board_ai', 'ai.usage.compose']]]))
    expect(f.reads[0]).toEqual(expect.arrayContaining([['eq', 'action', 'ai.usage.board_ai']]))
  })

  it('under the shared ceiling a board_ai call is recorded under its own action', async () => {
    const f = fakeDb(usage(10, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.compose'), { org: { plan: 'free', doors_count: 10 } })
    await checkAndRecordAiUsage('board_ai', WHO, { db: f.db, now: clock })
    expect(f.rows.at(-1)).toMatchObject({ action: 'ai.usage.board_ai', org_id: 'org-1', user_id: 'user-1' })
  })
})

// ─── BL-106: meeting_summary and ask_community, own flat buckets ──────

describe('BL-106 meeting_summary and ask_community caps', () => {
  const COMPLETE_SMALL = { plan: 'complete', band: '1-50' } as const

  it('the 11th meeting summary in a day for one community is 429 org_limit (no tier: legacy and pre-flip)', async () => {
    for (const tier of [null]) {
      // 10 summaries by two board members over the last 20 hours.
      const rows = [
        ...usage(5, { org: 'org-1', user: 'u-a' }, (i) => 60 + i * 120, 'ai.usage.meeting_summary'),
        ...usage(5, { org: 'org-1', user: 'u-b' }, (i) => 120 + i * 120, 'ai.usage.meeting_summary'),
      ]
      const f = fakeDb(rows)
      const err = await checkAndRecordAiUsage('meeting_summary', WHO, { db: f.db, now: clock, tier }).catch((e) => e)
      expect(err).toMatchObject({ code: 'rate_limited', status: 429, extra: { reason: 'org_limit' } })
      expect(err.publicMessage).toMatch(/^Your community has reached its limit of 10 meeting summaries a day\./)
      expect(err.publicMessage).toContain('You can still write the minutes yourself.')
      expect(f.rows).toHaveLength(10) // nothing recorded for a refused call
    }
  })

  it('the 6th meeting summary in an hour by one person is 429 user_limit', async () => {
    const f = fakeDb(usage(5, { org: 'org-1', user: 'user-1' }, (i) => i * 10, 'ai.usage.meeting_summary'))
    const err = await checkAndRecordAiUsage('meeting_summary', WHO, { db: f.db, now: clock, tier: null }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'user_limit', retryAfterSeconds: 20 * 60 } })
  })

  it('the 26th Copilot question in a day for one community is 429 org_limit, legacy and Complete 1–50', async () => {
    for (const tier of [null, COMPLETE_SMALL]) {
      const f = fakeDb(usage(25, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 30, 'ai.usage.ask_community'))
      const err = await checkAndRecordAiUsage('ask_community', WHO, { db: f.db, now: clock, tier }).catch((e) => e)
      expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit' } })
      expect(err.publicMessage).toMatch(/^Your community has reached its limit of 25 Copilot questions a day\./)
    }
  })

  it('the 16th Copilot question in an hour by one person is 429 user_limit; the 15th is allowed', async () => {
    const full = fakeDb(usage(15, { org: 'org-1', user: 'user-1' }, (i) => i * 2, 'ai.usage.ask_community'))
    const err = await checkAndRecordAiUsage('ask_community', WHO, { db: full.db, now: clock, tier: null }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'user_limit' } })
    const under = fakeDb(usage(14, { org: 'org-1', user: 'user-1' }, (i) => i * 2, 'ai.usage.ask_community'))
    await expect(
      checkAndRecordAiUsage('ask_community', WHO, { db: under.db, now: clock, tier: null }),
    ).resolves.toEqual({ usageId: 'usage-1' })
    expect(under.rows.at(-1)).toMatchObject({ action: 'ai.usage.ask_community', org_id: 'org-1', user_id: 'user-1' })
  })

  it('separate buckets: each reads only its own action, never the board_ai pool', async () => {
    for (const bucket of ['meeting_summary', 'ask_community'] as const) {
      const f = fakeDb([])
      await checkAndRecordAiUsage(bucket, WHO, { db: f.db, now: clock, tier: null })
      expect(f.reads.length).toBeGreaterThan(0)
      for (const read of f.reads) {
        expect(read).toEqual(expect.arrayContaining([['eq', 'action', `ai.usage.${bucket}`]]))
        expect(read.some(([op]) => op === 'in')).toBe(false)
      }
    }
  })

  it('a full board_ai pool does not block them, and they do not fill each other', async () => {
    const rows = [
      ...usage(150, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.board_ai'),
      ...usage(50, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.compose'),
      ...usage(25, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.ask_community'),
    ]
    const f = fakeDb(rows)
    await expect(checkAndRecordAiUsage('board_ai', WHO, { db: f.db, now: clock, tier: null })).rejects.toMatchObject({
      code: 'rate_limited',
    })
    await expect(checkAndRecordAiUsage('ask_community', WHO, { db: f.db, now: clock, tier: null })).rejects.toMatchObject({
      code: 'rate_limited',
    })
    await expect(checkAndRecordAiUsage('meeting_summary', WHO, { db: f.db, now: clock, tier: null })).resolves.toEqual({
      usageId: 'usage-1',
    })
  })

  it('their usage rows do not count against board_ai', async () => {
    const rows = [
      ...usage(10, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.meeting_summary'),
      ...usage(25, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.ask_community'),
      ...usage(199, { org: 'org-1', user: 'u-b' }, (i) => i, 'ai.usage.board_ai'),
    ]
    const f = fakeDb(rows)
    await expect(checkAndRecordAiUsage('board_ai', WHO, { db: f.db, now: clock, tier: null })).resolves.toEqual({
      usageId: 'usage-1',
    })
  })
})

// ─── BL-108: per-plan, per-band caps (replacing BL-106's provisional ones) ──

describe('BL-108 per-plan, per-band Copilot and meeting-summary caps', () => {
  it('Essentials: the 3rd meeting summary in a day is 429 org_limit (2 a day, every band)', async () => {
    const f = fakeDb(usage(2, { org: 'org-1', user: 'u-a' }, (i) => 120 + i * 60, 'ai.usage.meeting_summary'))
    const err = await checkAndRecordAiUsage('meeting_summary', WHO, {
      db: f.db,
      now: clock,
      tier: { plan: 'essentials', band: '101-200' },
    }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit' } })
    expect(err.publicMessage).toMatch(/^Your community has reached its limit of 2 meeting summaries a day\./)
  })

  it('Complete: 3 meeting summaries a day', async () => {
    const f = fakeDb(usage(3, { org: 'org-1', user: 'u-a' }, (i) => 120 + i * 60, 'ai.usage.meeting_summary'))
    const err = await checkAndRecordAiUsage('meeting_summary', WHO, {
      db: f.db,
      now: clock,
      tier: { plan: 'complete', band: '401+' },
    }).catch((e) => e)
    expect(err.publicMessage).toMatch(/^Your community has reached its limit of 3 meeting summaries a day\./)
  })

  it('Essentials 1–50: 10 Copilot questions a day (no longer "not on the plan")', async () => {
    const under = fakeDb(usage(9, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 30, 'ai.usage.ask_community'))
    await expect(
      checkAndRecordAiUsage('ask_community', WHO, { db: under.db, now: clock, tier: { plan: 'essentials', band: '1-50' } }),
    ).resolves.toEqual({ usageId: 'usage-1' })
    const full = fakeDb(usage(10, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 30, 'ai.usage.ask_community'))
    const err = await checkAndRecordAiUsage('ask_community', WHO, {
      db: full.db,
      now: clock,
      tier: { plan: 'essentials', band: '1-50' },
    }).catch((e) => e)
    expect(err.publicMessage).toMatch(/^Your community has reached its limit of 10 Copilot questions a day\./)
  })

  it('Complete 201–400: 100 Copilot questions a day', async () => {
    const tier = { plan: 'complete', band: '201-400' } as const
    const under = fakeDb(usage(99, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 5, 'ai.usage.ask_community'))
    await expect(checkAndRecordAiUsage('ask_community', WHO, { db: under.db, now: clock, tier })).resolves.toEqual({
      usageId: 'usage-1',
    })
    const full = fakeDb(usage(100, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 5, 'ai.usage.ask_community'))
    const err = await checkAndRecordAiUsage('ask_community', WHO, { db: full.db, now: clock, tier }).catch((e) => e)
    expect(err.publicMessage).toMatch(/^Your community has reached its limit of 100 Copilot questions a day\./)
  })

  it('an Essentials org read from orgs: base 25 before the flip, 10 after', async () => {
    const f = fakeDb(usage(10, { org: 'org-1', user: 'u-a' }, (i) => 61 + i * 30, 'ai.usage.ask_community'), {
      org: { plan: 'essentials', doors_count: 40 },
    })
    const before = await checkAndRecordAiUsage('ask_community', WHO, { db: f.db, now: clock, tier: await loadAiTier(f.db, 'org-1', false) })
    expect(before).toEqual({ usageId: 'usage-1' })
    const after = await checkAndRecordAiUsage('ask_community', WHO, {
      db: f.db,
      now: clock,
      tier: await loadAiTier(f.db, 'org-1', true),
    }).catch((e) => e)
    expect(after).toMatchObject({ extra: { reason: 'org_limit' } })
  })

  it('a 0 ceiling would still answer plan_limit (mechanism kept, no plan uses it)', () => {
    const err = notOnPlanError(AI_RATE_LIMITS.ask_community)
    expect(err).toMatchObject({ code: 'rate_limited', status: 429, extra: { reason: 'plan_limit', retryAfterSeconds: 86400 } })
    expect(err.publicMessage).toBe('Copilot questions aren’t included in your community’s plan.')
  })
})

// ─── BL-108: the monthly org AI spend meter ──────────────────────────

/**
 * fakeDb plus the meter's count-only reads: `select('id', { head: true })`
 * resolves to the count for the filtered action from `counts`.
 */
function meteredDb(rows: Row[], counts: Record<string, number>, opts: { countError?: unknown } = {}) {
  const base = fakeDb(rows)
  const countReads: string[] = []
  const db = {
    from(table: string) {
      const inner = (base.db as unknown as { from: (t: string) => Record<string, unknown> }).from(table)
      if (table !== 'audit_log') return inner
      const select = inner.select as (...a: unknown[]) => unknown
      return {
        ...inner,
        select: (cols: string, o?: { head?: boolean }) => {
          if (!o?.head) return select(cols)
          let action = ''
          const c = {
            eq: (col: string, v: string) => ((col === 'action' ? (action = v) : null), c),
            gte: () => c,
            then: (resolve: (r: unknown) => void) => {
              countReads.push(action)
              resolve(opts.countError ? { count: null, error: opts.countError } : { count: counts[action] ?? 0, error: null })
            },
          }
          return c
        },
      }
    },
  }
  return { ...base, db: db as never, countReads }
}

const ESSENTIALS_40: AiBudget = { tier: { plan: 'essentials', band: '1-50' }, doors: 40, trial: false }
// Essentials 1–50 is $49: notice $9.80, tier 1 $12.25, tier 2 $14.70. One Copilot question = $0.0234.
const copilotCalls = (n: number) => ({ 'ai.usage.ask_community': n })

describe('BL-108 spend meter in checkAndRecordAiUsage', () => {
  beforeEach(() => resetAiSpendCache())

  it('with no org budget (flag off, or a legacy org) the meter never runs: no count reads, today’s limits', async () => {
    const f = meteredDb([], copilotCalls(100_000))
    const notify = vi.fn()
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, notify })).resolves.toEqual({ usageId: 'usage-1' })
    expect(f.countReads).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('a legacy org (no budget) is never metered, whatever its spend', async () => {
    const f = meteredDb([], copilotCalls(100_000))
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, budget: null })).resolves.toEqual({ usageId: 'usage-1' })
    expect(f.countReads).toHaveLength(0)
  })

  it('reads every bucket’s count for the org, this calendar month (UTC)', async () => {
    const f = meteredDb([], {})
    await checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify: vi.fn() })
    expect(new Set(f.countReads)).toEqual(new Set(Object.keys(AI_RATE_LIMITS).map((b) => `ai.usage.${b}`)))
  })

  it('under 20%: allowed, no notice', async () => {
    const notify = vi.fn()
    const f = meteredDb([], copilotCalls(400)) // $9.36
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify })).resolves.toEqual({
      usageId: 'usage-1',
    })
    expect(notify).not.toHaveBeenCalled()
  })

  it('20%: allowed, and the board is notified (FYI)', async () => {
    const notify = vi.fn(async () => {})
    const f = meteredDb([], copilotCalls(420)) // $9.83
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify })).resolves.toEqual({
      usageId: 'usage-1',
    })
    expect(notify).toHaveBeenCalledWith('org-1', 'notice', NOW)
  })

  it('25%: resident-facing and automatic buckets refused with their existing message (wait to the 1st); board buckets still work', async () => {
    const notify = vi.fn(async () => {})
    for (const bucket of ['ask_docs', 'help_ask', 'rewrite', 'arc_precheck', 'resident_assistant', 'inbox_autodraft'] as const) {
      resetAiSpendCache()
      const f = meteredDb([], copilotCalls(530)) // $12.40
      const err = await checkAndRecordAiUsage(bucket, WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify }).catch((e) => e)
      expect(err).toMatchObject({ code: 'rate_limited', status: 429, extra: { reason: 'spend_ceiling' } })
      expect(err.publicMessage).toMatch(/^Your community has reached its limit of \d+ /)
      expect(err.publicMessage).toContain('Try again in about 14 days.')
      // 2026-10-18T12:00Z → 2026-11-01T00:00Z
      expect(err.headers).toEqual({ 'Retry-After': String(13.5 * 86400) })
      expect(f.rows).toHaveLength(0) // a refused call is not recorded
    }
    expect(notify).toHaveBeenCalledWith('org-1', 'resident_stop', NOW)
    for (const bucket of ['ask_community', 'meeting_summary', 'board_ai', 'compose', 'follow_up_letter', 'translate'] as const) {
      resetAiSpendCache()
      const f = meteredDb([], copilotCalls(530))
      await expect(checkAndRecordAiUsage(bucket, WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify })).resolves.toEqual({
        usageId: 'usage-1',
      })
    }
  })

  it('30%: board AI refused too, until the 1st', async () => {
    const notify = vi.fn(async () => {})
    const f = meteredDb([], copilotCalls(630)) // $14.74
    const err = await checkAndRecordAiUsage('meeting_summary', WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify }).catch((e) => e)
    expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'spend_ceiling' } })
    expect(err.publicMessage).toBe(
      'Your community has used this month’s AI budget, so AI features are paused until November 1. You can still write the minutes yourself.',
    )
    expect(notify).toHaveBeenCalledWith('org-1', 'board_stop', NOW)
  })

  it('trials: $5 a month in total', async () => {
    const trial: AiBudget = { ...ESSENTIALS_40, trial: true }
    const f = meteredDb([], copilotCalls(214)) // $5.01
    const err = await checkAndRecordAiUsage('ask_community', WHO, { db: f.db, now: clock, budget: trial, notify: vi.fn(async () => {}) }).catch(
      (e) => e,
    )
    expect(err).toMatchObject({ extra: { reason: 'spend_ceiling' } })
    resetAiSpendCache()
    const g = meteredDb([], copilotCalls(170)) // $3.98: past the trial's notice, under tier 1
    await expect(
      checkAndRecordAiUsage('ask_community', WHO, { db: g.db, now: clock, budget: trial, notify: vi.fn(async () => {}) }),
    ).resolves.toEqual({ usageId: 'usage-1' })
  })

  it('a meter read failure does not block AI: the per-bucket caps still apply, and the log carries ids and codes only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const ok = meteredDb([], {}, { countError: { code: '57014', message: 'canceling statement for org jane@example.com' } })
      await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: ok.db, now: clock, budget: ESSENTIALS_40 })).resolves.toEqual({
        usageId: 'usage-1',
      })
      // Over the bucket's own ceiling (Essentials 1–50 ask_docs: 50/day) it is still refused.
      const full = meteredDb(usage(50, { org: 'org-1', user: 'u-a' }, (i) => i, 'ai.usage.ask_docs'), {}, { countError: { code: '57014' } })
      const err = await checkAndRecordAiUsage('ask_docs', WHO, { db: full.db, now: clock, budget: ESSENTIALS_40 }).catch((e) => e)
      expect(err).toMatchObject({ code: 'rate_limited', extra: { reason: 'org_limit' } })
      const logged = JSON.stringify(spy.mock.calls)
      expect(logged).toContain('ai.spend.read.ask_docs')
      expect(logged).toContain('57014')
      expect(logged).not.toContain('jane@example.com')
      expect(logged).not.toContain('canceling statement')
    } finally {
      spy.mockRestore()
    }
  })

  it('a notifier that throws never blocks the call', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = meteredDb([], copilotCalls(420))
      const notify = vi.fn(async () => {
        throw new Error('smtp down for jane@example.com')
      })
      await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, budget: ESSENTIALS_40, notify })).resolves.toEqual({
        usageId: 'usage-1',
      })
      expect(JSON.stringify(spy.mock.calls)).not.toContain('jane@example.com')
    } finally {
      spy.mockRestore()
    }
  })

  it('cached 60 seconds per org; a new month reads fresh', async () => {
    const f = meteredDb([], copilotCalls(10))
    const n = Object.keys(AI_RATE_LIMITS).length
    await readMonthlyAiSpend(f.db, 'org-1', NOW)
    await readMonthlyAiSpend(f.db, 'org-1', NOW + 59_000)
    expect(f.countReads).toHaveLength(n)
    await readMonthlyAiSpend(f.db, 'org-1', NOW + 61_000)
    expect(f.countReads).toHaveLength(2 * n)
    const r = await readMonthlyAiSpend(f.db, 'org-1', Date.parse('2026-11-01T00:00:10Z'))
    expect(f.countReads).toHaveLength(3 * n)
    expect(r.month).toBe('2026-11')
    expect(r.spendUsd).toBeCloseTo(10 * 0.0234, 9)
  })

  it('loadAiBudget: doors and trial footing alongside the tier; null exactly when the tier is', async () => {
    const f = fakeDb([], { org: { plan: 'complete', doors_count: 450 }, units: 10 })
    await expect(loadAiBudget(f.db, 'org-1', true)).resolves.toEqual({ tier: { plan: 'complete', band: '401+' }, doors: 450, trial: false })
    const t = fakeDb([], { org: { plan: 'free', doors_count: 30 } })
    await expect(loadAiBudget(t.db, 'org-1', true)).resolves.toEqual({ tier: { plan: 'essentials', band: '1-50' }, doors: 30, trial: true })
    const legacy = fakeDb([], { org: { plan: 'monthly', doors_count: 30 } })
    await expect(loadAiBudget(legacy.db, 'org-1', true)).resolves.toBeNull()
    await expect(loadAiBudget(legacy.db, 'org-1', false)).resolves.toBeNull()
  })
})

describe('BL-108 platform kill switch (AI_PLATFORM_KILL_SWITCH)', () => {
  it('refuses every bucket with a friendly 503, before any read or ledger write', async () => {
    for (const bucket of Object.keys(AI_RATE_LIMITS) as Array<keyof typeof AI_RATE_LIMITS>) {
      const f = fakeDb([])
      const err = await checkAndRecordAiUsage(bucket, WHO, {
        db: f.db,
        now: clock,
        tier: null,
        env: { AI_PLATFORM_KILL_SWITCH: '1' },
      }).catch((e) => e)
      expect(err).toMatchObject({ code: 'upstream_unavailable', status: 503, extra: { reason: 'ai_paused' } })
      expect(err.publicMessage).toBe(AI_PAUSED_MESSAGE)
      expect(f.reads).toHaveLength(0)
      expect(f.rows).toHaveLength(0)
    }
  })

  it('answers the 503 envelope through withRoute', async () => {
    const route = withRoute('t', async () => {
      await checkAndRecordAiUsage('ask_docs', WHO, { db: fakeDb([]).db, now: clock, env: { AI_PLATFORM_KILL_SWITCH: 'true' } })
      return new Response('unreachable')
    })
    const res = await route(new Request('http://x'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: { code: 'upstream_unavailable', reason: 'ai_paused', message: AI_PAUSED_MESSAGE } })
  })

  it('only an explicit on value trips it', () => {
    for (const v of ['1', 'true', 'TRUE', 'on', 'yes', ' 1 ']) expect(aiKillSwitchOn({ AI_PLATFORM_KILL_SWITCH: v })).toBe(true)
    for (const v of [undefined, '', '0', 'false', 'off', 'no']) expect(aiKillSwitchOn({ AI_PLATFORM_KILL_SWITCH: v })).toBe(false)
  })

  it('unset: calls go through as before', async () => {
    const f = fakeDb([])
    await expect(checkAndRecordAiUsage('ask_docs', WHO, { db: f.db, now: clock, tier: null, env: {} })).resolves.toEqual({
      usageId: 'usage-1',
    })
  })
})

describe('describeWait: long waits in days (BL-108 spend stops)', () => {
  it('48 hours and up reads in days; shorter waits unchanged', () => {
    expect(describeWait(47 * 3600)).toBe('about 47 hours')
    expect(describeWait(48 * 3600)).toBe('about 2 days')
    expect(describeWait(13.5 * 86400)).toBe('about 14 days')
  })
})
