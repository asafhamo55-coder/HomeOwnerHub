import { describe, expect, it, vi } from 'vitest'
import { parseRecipients, previousUtcDay, runAiSpendAlert } from './ai-spend-alert'

// BL-108: the daily platform AI spend alert. No real email: the sender is a
// mock; the db is a count-only fake.

const NOW = Date.parse('2026-10-20T00:30:00.000Z')
const COST = { ask_community: 0.0234, ask_docs: 0.0009 }

function fakeDb(counts: Record<string, number>, error?: { code: string }) {
  const reads: Array<Record<string, unknown>> = []
  const db = {
    from: () => {
      const f: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (c: string, v: string) => ((f[c] = v), q),
        gte: (c: string, v: string) => ((f[`${c}>=`] = v), q),
        lt: async (c: string, v: string) => {
          f[`${c}<`] = v
          reads.push({ ...f })
          return error ? { count: null, error } : { count: counts[f.action as string] ?? 0, error: null }
        },
      }
      return q
    },
  }
  return { db: db as never, reads }
}

const sender = () => vi.fn(async (_e: { to: string; subject: string; html: string; text: string }) => ({ ok: true as const }))

describe('runAiSpendAlert', () => {
  it('counts yesterday (UTC) per bucket across all orgs', async () => {
    const f = fakeDb({})
    const sendEmail = sender()
    const r = await runAiSpendAlert(f.db, { sendEmail, costPerCallUsd: COST, thresholdUsd: 50 }, { now: NOW, env: {} })
    expect(r).toMatchObject({ day: '2026-10-19', alerted: false, reason: 'under_threshold' })
    expect(f.reads).toEqual(
      expect.arrayContaining([
        { action: 'ai.usage.ask_community', 'created_at>=': '2026-10-19T00:00:00.000Z', 'created_at<': '2026-10-20T00:00:00.000Z' },
      ]),
    )
    expect(f.reads.some((r) => 'org_id' in r)).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('over $50: emails each AI_SPEND_ALERT_TO address with the estimate and the kill-switch instruction', async () => {
    const f = fakeDb({ 'ai.usage.ask_community': 2200, 'ai.usage.ask_docs': 100 }) // $51.48 + $0.09
    const sendEmail = sender()
    const r = await runAiSpendAlert(
      f.db,
      { sendEmail, costPerCallUsd: COST, thresholdUsd: 50 },
      { now: NOW, env: { AI_SPEND_ALERT_TO: 'ops@platform.test, second@platform.test' } },
    )
    expect(r.alerted).toBe(true)
    expect(r.spendUsd).toBeCloseTo(2200 * 0.0234 + 100 * 0.0009, 6)
    expect(sendEmail).toHaveBeenCalledTimes(2)
    const email = sendEmail.mock.calls[0]![0]
    expect(email.to).toBe('ops@platform.test')
    expect(email.subject).toBe('AI spend alert: ~$51.57 on 2026-10-19 (threshold $50)')
    expect(email.text).toContain('AI_PLATFORM_KILL_SWITCH=1')
    expect(email.text).toContain('ask_community: 2200 calls')
  })

  it('over the threshold with no recipient configured: logs, sends nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb({ 'ai.usage.ask_community': 5000 })
      const sendEmail = sender()
      const r = await runAiSpendAlert(f.db, { sendEmail, costPerCallUsd: COST, thresholdUsd: 50 }, { now: NOW, env: {} })
      expect(r).toMatchObject({ alerted: false, reason: 'no_recipient' })
      expect(sendEmail).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('a read error throws (Inngest retries) and logs the code only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb({}, { code: '57014' })
      await expect(
        runAiSpendAlert(f.db, { sendEmail: sender(), costPerCallUsd: COST, thresholdUsd: 50 }, { now: NOW, env: {} }),
      ).rejects.toThrow('read_failed')
      expect(JSON.stringify(spy.mock.calls)).toContain('57014')
    } finally {
      spy.mockRestore()
    }
  })

  it('helpers', () => {
    expect(previousUtcDay(Date.parse('2026-11-01T00:30:00Z'))).toEqual({
      start: '2026-10-31T00:00:00.000Z',
      end: '2026-11-01T00:00:00.000Z',
      day: '2026-10-31',
    })
    expect(parseRecipients(' a@x.test ,, nope , b@y.test')).toEqual(['a@x.test', 'b@y.test'])
    expect(parseRecipients(undefined)).toEqual([])
  })
})
