import { describe, expect, it, vi } from 'vitest'
import { runWeeklyAnalytics } from './weekly-analytics'

// BL-171: weekly counts-only digest. No real email; the db is a fake.

const NOW = Date.parse('2026-11-02T13:00:00.000Z')
const THIS_START = '2026-10-26T13:00:00.000Z'
const PREV_START = '2026-10-19T13:00:00.000Z'

interface Reads {
  table: string
  f: Record<string, unknown>
}

// Counts keyed by table + window start; audit rows keyed by window start.
function fakeDb(opts: { counts?: Record<string, number>; audit?: Record<string, Array<string | { org_id: string; action: string }>>; error?: boolean } = {}) {
  const reads: Reads[] = []
  const db = {
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      let isHead = false
      let from = 0
      let to = 0
      const settle = () => {
        if (opts.error) return { count: null, data: null, error: { code: 'XX' } }
        reads.push({ table, f: { ...f } })
        const start = (f.gte as string[])[1]!
        if (isHead) return { count: opts.counts?.[`${table}@${start}`] ?? 0, error: null }
        const notLike = (f.notLike as string[] | undefined) ?? []
        const rows = (opts.audit?.[start] ?? [])
          .map((r) => (typeof r === 'string' ? { org_id: r, action: 'approval.created' } : r))
          .filter((r) => !notLike.some((p) => r.action.startsWith(p.replace(/%$/, ''))))
          .map(({ org_id }) => ({ org_id }))
        return { data: rows.slice(from, to + 1), error: null }
      }
      const q: Record<string, unknown> = {
        select: (_c: string, o?: unknown) => ((isHead = !!o), q),
        eq: (c: string, v: unknown) => ((f[`eq:${c}`] = v), q),
        in: (c: string, v: unknown) => ((f[`in:${c}`] = v), q),
        gte: (c: string, v: string) => ((f.gte = [c, v]), q),
        lt: (c: string, v: string) => ((f.lt = [c, v]), q),
        not: (_c: string, op: string, v: string) => {
          if (op === 'like') f.notLike = [...((f.notLike as string[] | undefined) ?? []), v]
          return q
        },
        order: () => q,
        range: (a: number, b: number) => ((from = a), (to = b), q),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(settle()).then(res, rej),
      }
      return q
    },
  }
  return { db: db as never, reads }
}

const sender = () =>
  vi.fn(async (_e: { to: string; subject: string; html: string; text: string }) => ({ ok: true as const }))
const ENV = { ANALYTICS_REPORT_TO: 'owner@platform.test' }

describe('runWeeklyAnalytics', () => {
  it('counts both weeks and shows week over week', async () => {
    const f = fakeDb({
      counts: {
        [`orgs@${THIS_START}`]: 3,
        [`orgs@${PREV_START}`]: 1,
        [`associations@${THIS_START}`]: 4,
        [`approval_requests@${THIS_START}`]: 9,
        [`communications@${THIS_START}`]: 6,
      },
      audit: { [THIS_START]: ['o1', 'o2', 'o1', 'o3'], [PREV_START]: ['o1'] },
    })
    const sendEmail = sender()
    const r = await runWeeklyAnalytics(f.db, { sendEmail }, { now: NOW, env: ENV })
    expect(r.sent).toBe(true)
    expect(r.counts).toMatchObject({ newOrgs: 3, newAssociations: 4, activeBoards: 3, approvalsCreated: 9 })
    expect(r.previous).toMatchObject({ newOrgs: 1, activeBoards: 1 })
    const email = sendEmail.mock.calls[0]![0]
    expect(email.to).toBe('owner@platform.test')
    expect(email.text).toContain('New orgs: 3 (+2 vs last week)')
    expect(email.text).toContain('Active boards (any activity): 3 (+2 vs last week)')
    expect(f.reads.some((x) => x.table === 'communications' && x.f['eq:category'] === 'announcement')).toBe(true)
    expect(f.reads.some((x) => x.table === 'approval_requests' && Array.isArray(x.f['in:status']))).toBe(true)
  })

  it('does not count AI meter rows as board activity', async () => {
    const f = fakeDb({
      audit: {
        [THIS_START]: [
          { org_id: 'meter-only', action: 'ai.usage.draft' },
          { org_id: 'meter-only', action: 'ai.spend.notice.80' },
          { org_id: 'real', action: 'approval.created' },
          { org_id: 'real', action: 'ai.usage.draft' },
        ],
      },
    })
    const r = await runWeeklyAnalytics(f.db, { sendEmail: sender() }, { now: NOW, env: ENV })
    expect(r.counts?.activeBoards).toBe(1)
  })

  it('pages the audit scan past 1000 rows', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => `org-${i % 1200}`)
    const f = fakeDb({ audit: { [THIS_START]: many } })
    const r = await runWeeklyAnalytics(f.db, { sendEmail: sender() }, { now: NOW, env: ENV })
    expect(r.counts?.activeBoards).toBe(1200)
    expect(r.counts?.activeBoardsCapped).toBe(false)
  })

  it('has no PII: no @ and no org names in the body', async () => {
    const f = fakeDb({ counts: { [`orgs@${THIS_START}`]: 2 }, audit: { [THIS_START]: ['Maple Glen HOA', 'org-2'] } })
    const sendEmail = sender()
    await runWeeklyAnalytics(f.db, { sendEmail }, { now: NOW, env: ENV })
    const { text, html, subject } = sendEmail.mock.calls[0]![0]
    for (const body of [text, html, subject]) {
      expect(body).not.toContain('@')
      expect(body).not.toContain('Maple Glen')
      expect(body).not.toContain('org-2')
    }
  })

  it('unset recipient: logs, reads nothing, sends nothing', async () => {
    const f = fakeDb()
    const sendEmail = sender()
    const r = await runWeeklyAnalytics(f.db, { sendEmail }, { now: NOW, env: {} })
    expect(r).toMatchObject({ sent: false, reason: 'no_recipient' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(f.reads).toHaveLength(0)
  })

  it('respects the outbound guard: a blocked send is reported as not sent', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const sendEmail = vi.fn(async (_e: { to: string }) => ({ ok: false as const, error: 'outbound_blocked' }))
      const r = await runWeeklyAnalytics(fakeDb().db, { sendEmail }, { now: NOW, env: ENV })
      expect(sendEmail).toHaveBeenCalledTimes(1)
      expect(r).toMatchObject({ sent: false, reason: 'send_failed' })
    } finally {
      spy.mockRestore()
    }
  })

  it('a read error throws so Inngest retries', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const sendEmail = sender()
      await expect(runWeeklyAnalytics(fakeDb({ error: true }).db, { sendEmail }, { now: NOW, env: ENV })).rejects.toThrow()
      expect(sendEmail).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
