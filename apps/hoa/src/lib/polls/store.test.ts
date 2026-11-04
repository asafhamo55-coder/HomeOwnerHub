import { describe, expect, it, vi } from 'vitest'
import { M9_APPLIED } from '@homeowner-portal/db/m9'
import { createDraftPoll, listPolls, pollsAvailable, setPollStatus, submitAnswer, type PollsClient } from './store'

// Polls are live (M9_APPLIED = true). These cover the flag-true paths with a
// fake client; the database rules are covered by the integration suite.

function rpcClient(error: { code?: string } | null): PollsClient {
  return { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: null, error }) }
}

describe('polls store with the flag on', () => {
  it('is switched on', () => {
    expect(M9_APPLIED).toBe(true)
    expect(pollsAvailable()).toBe(true)
  })

  it('lists polls from the database', async () => {
    const q = { order: vi.fn(), limit: vi.fn(), in: vi.fn(), then: undefined as unknown }
    q.order.mockReturnValue(q)
    q.limit.mockReturnValue(q)
    q.in.mockReturnValue(q)
    q.then = (res: (v: unknown) => void) => res({ data: [{ id: 'p1' }], error: null })
    const client = { from: vi.fn().mockReturnValue({ select: () => q }), rpc: vi.fn() } as unknown as PollsClient
    const r = await listPolls(client, ['open'])
    expect(r).toEqual({ ok: true, data: [{ id: 'p1' }] })
    expect(q.in).toHaveBeenCalledWith('status', ['open'])
  })

  it('submits an answer through the database function', async () => {
    const client = rpcClient(null)
    const r = await submitAnswer(client, { pollId: 'p', unitId: 'u', optionIds: ['o1'] })
    expect(r.ok).toBe(true)
    expect(client.rpc).toHaveBeenCalledWith('submit_poll_response', { p_poll_id: 'p', p_unit_id: 'u', p_option_ids: ['o1'] })
  })

  it('says plainly when a poll has closed or nothing was picked', async () => {
    const closed = await submitAnswer(rpcClient({ code: '55000' }), { pollId: 'p', unitId: 'u', optionIds: ['o'] })
    expect(closed).toEqual({ ok: false, error: 'This poll has closed. Your answer was not saved.' })
    const empty = await submitAnswer(rpcClient({ code: '22023' }), { pollId: 'p', unitId: 'u', optionIds: [] })
    expect(empty).toEqual({ ok: false, error: 'Pick an answer, then press Send.' })
  })

  it('reports a rejected status change in plain words', async () => {
    const eq = vi.fn().mockResolvedValue({ error: { code: 'x' } })
    const client = { from: () => ({ update: () => ({ eq }) }), rpc: vi.fn() } as unknown as PollsClient
    const r = await setPollStatus(client, 'p', 'open')
    expect(r.ok).toBe(false)
  })

  it('removes the draft when its answers fail to save', async () => {
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const from = vi.fn((t: string) =>
      t === 'polls'
        ? {
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new' }, error: null }) }) }),
            delete: del,
          }
        : { insert: () => Promise.resolve({ error: { code: 'x' } }) },
    )
    const r = await createDraftPoll({ from, rpc: vi.fn() } as unknown as PollsClient, {
      organizationId: 'o',
      associationId: 'a',
      createdBy: 'u',
      title: 't',
      description: null,
      allowMultiple: false,
      resultsVisibility: 'after_close',
      closesAt: null,
      options: ['a', 'b'],
    })
    expect(r.ok).toBe(false)
    expect(del).toHaveBeenCalled()
  })
})
