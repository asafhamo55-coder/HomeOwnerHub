import { describe, expect, it, vi } from 'vitest'
import { closingSoonText, loadPollsToAnswer, pollBadgeText } from './resident-badge'
import type { PollsClient } from './store'

const NOW = new Date('2026-11-06T12:00:00Z')
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

type Poll = { id: string; title: string; association_id: string; status: 'open'; closes_at: string | null }

/** Fake client: records filters, answers like RLS would for these rows. */
function fake(polls: Poll[], answers: Array<{ poll_id: string; unit_id: string }>) {
  const calls: Array<{ table: string; filters: Record<string, unknown> }> = []
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {}
    calls.push({ table, filters })
    const q: Record<string, unknown> = {}
    const chain = () => q
    q.select = chain
    q.eq = (c: string, v: unknown) => ((filters[c] = v), q)
    q.in = (c: string, v: unknown) => ((filters[c] = v), q)
    q.limit = chain
    q.then = (res: (v: unknown) => void) => {
      if (table === 'polls') {
        const ids = filters.association_id as string[]
        res({ data: polls.filter((p) => ids.includes(p.association_id)), error: null })
      } else {
        const pids = filters.poll_id as string[]
        const uids = filters.unit_id as string[]
        res({ data: answers.filter((a) => pids.includes(a.poll_id) && uids.includes(a.unit_id)), error: null })
      }
    }
    return q
  })
  return { client: { from, rpc: vi.fn() } as unknown as PollsClient, calls }
}

const units = [{ unit_id: 'u1', association_id: 'a1' }]
const poll = (id: string, over: Partial<Poll> = {}): Poll => ({
  id,
  title: `Question ${id}`,
  association_id: 'a1',
  status: 'open',
  closes_at: null,
  ...over,
})

describe('loadPollsToAnswer', () => {
  it('counts only open polls the home has not answered', async () => {
    const { client } = fake([poll('p1'), poll('p2'), poll('p3')], [{ poll_id: 'p2', unit_id: 'u1' }])
    expect((await loadPollsToAnswer(client, units, NOW)).count).toBe(2)
  })

  it('treats a poll past its end date as closed', async () => {
    const { client } = fake([poll('p1', { closes_at: day(-1) }), poll('p2', { closes_at: day(5) })], [])
    expect((await loadPollsToAnswer(client, units, NOW)).count).toBe(1)
  })

  it('ignores polls from associations the resident has no home in, and answers from other homes', async () => {
    const { client, calls } = fake(
      [poll('p1'), poll('p2', { association_id: 'other' })],
      [{ poll_id: 'p1', unit_id: 'someone-else' }],
    )
    expect((await loadPollsToAnswer(client, units, NOW)).count).toBe(1)
    expect(calls[0].filters.association_id).toEqual(['a1'])
  })

  it('uses two reads however many polls there are', async () => {
    const { client, calls } = fake([poll('p1'), poll('p2'), poll('p3'), poll('p4')], [])
    await loadPollsToAnswer(client, units, NOW)
    expect(calls.map((c) => c.table)).toEqual(['polls', 'poll_responses'])
  })

  it('stays at zero with no homes or no open polls, without a second read', async () => {
    const none = fake([], [])
    expect((await loadPollsToAnswer(none.client, units, NOW)).count).toBe(0)
    expect(none.calls).toHaveLength(1)
    const noHome = fake([poll('p1')], [])
    expect((await loadPollsToAnswer(noHome.client, [{ unit_id: 'u', association_id: null }], NOW)).count).toBe(0)
    expect(noHome.calls).toHaveLength(0)
  })

  it('picks the soonest unanswered poll that closes within 3 days', async () => {
    const { client } = fake(
      [
        poll('far', { closes_at: day(10) }),
        poll('later', { closes_at: day(2.5) }),
        poll('soon', { closes_at: day(1) }),
        poll('answered', { closes_at: day(0.5) }),
      ],
      [{ poll_id: 'answered', unit_id: 'u1' }],
    )
    const r = await loadPollsToAnswer(client, units, NOW)
    expect(r.count).toBe(4 - 1)
    expect(r.closingSoon?.id).toBe('soon')
  })

  it('has no closing-soon poll when none ends within 3 days', async () => {
    const { client } = fake([poll('p1', { closes_at: day(4) }), poll('p2')], [])
    expect((await loadPollsToAnswer(client, units, NOW)).closingSoon).toBeNull()
  })

  it('hides the nudge when a read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      from: () => {
        const q: Record<string, unknown> = {}
        q.select = q.eq = q.in = q.limit = () => q
        q.then = (res: (v: unknown) => void) => res({ data: null, error: { code: 'x' } })
        return q
      },
      rpc: vi.fn(),
    } as unknown as PollsClient
    expect(await loadPollsToAnswer(client, units, NOW)).toEqual({ count: 0, closingSoon: null })
    spy.mockRestore()
  })
})

describe('copy', () => {
  it('words the badge', () => {
    expect(pollBadgeText(0)).toBeNull()
    expect(pollBadgeText(1)).toBe('1 poll to answer')
    expect(pollBadgeText(2)).toBe('2 polls to answer')
  })

  it('words the closing-soon line with the day and the question', () => {
    const text = closingSoonText({ id: 'p', title: 'Pool hours?', closesAt: '2026-11-08T17:00:00Z' }, 'America/New_York')
    expect(text).toBe('A poll closes on Sunday, Nov 8: Pool hours?')
    expect(text).not.toContain('—')
  })
})
