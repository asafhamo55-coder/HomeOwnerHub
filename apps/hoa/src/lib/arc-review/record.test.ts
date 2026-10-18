import { describe, expect, it, vi } from 'vitest'
import { closeReviewsWithoutDecision, recordBoardDecisionOnReview, type ArcReviewDb } from './record'

type Call = { op: string; table: string; payload?: unknown; filters: Array<[string, string, unknown]> }

/** A chainable fake: every query resolves to the next queued result for its op. */
function fakeDb(results: { select?: Array<{ data: unknown; error: unknown }>; update?: Array<{ data: unknown; error: unknown }> }) {
  const calls: Call[] = []
  const queues = { select: [...(results.select ?? [])], update: [...(results.update ?? [])] }
  const db = {
    from(table: string) {
      const call: Call = { op: 'select', table, filters: [] }
      calls.push(call)
      const q: Record<string, unknown> = {}
      const chain = (name: string) => (col: string, val?: unknown) => {
        call.filters.push([name, col, val])
        return q
      }
      q.select = () => q
      q.update = (payload: unknown) => {
        call.op = 'update'
        call.payload = payload
        return q
      }
      q.eq = chain('eq')
      q.then = (resolve: (v: unknown) => void) =>
        resolve((call.op === 'update' ? queues.update.shift() : queues.select.shift()) ?? { data: null, error: null })
      return q
    },
  }
  return { db: db as unknown as ArcReviewDb, calls }
}

const ORG = 'org-1'
const ARC = 'arc-1'

describe('recordBoardDecisionOnReview', () => {
  it('closes each pending W37 draft with agreement and feedback, scoped to org, workflow and arc', async () => {
    const { db, calls } = fakeDb({
      select: [{ data: [{ id: 'run-1', output: { mode: 'review', status: 'answered', suggestion: { decision: 'deny', reasoning: '', conditions: [] } } }], error: null }],
      update: [{ data: null, error: null }],
    })
    const r = await recordBoardDecisionOnReview(db, { orgId: ORG, arcId: ARC, userId: 'u1', decision: 'denied' })
    expect(r).toEqual({ ok: true, recorded: 1 })
    const read = calls[0]!
    expect(read.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'organization_id', ORG],
        ['eq', 'workflow_id', 'W37'],
        ['eq', 'status', 'pending_human_approval'],
        ['eq', 'input->>arcRequestId', ARC],
      ]),
    )
    const upd = calls[1]!
    expect(upd.op).toBe('update')
    expect(upd.payload).toMatchObject({
      status: 'completed',
      human_approved: true,
      human_approver: 'u1',
      human_feedback: 'Board denied. AI suggested: deny.',
    })
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', 'run-1'], ['eq', 'status', 'pending_human_approval']]))
  })

  it('disagreement is human_approved false with no approved_at', async () => {
    const { db, calls } = fakeDb({
      select: [{ data: [{ id: 'run-1', output: { mode: 'review', status: 'answered', suggestion: { decision: 'approve', reasoning: '', conditions: [] } } }], error: null }],
    })
    await recordBoardDecisionOnReview(db, { orgId: ORG, arcId: ARC, userId: 'u1', decision: 'denied' })
    expect(calls[1]!.payload).toMatchObject({ human_approved: false, approved_at: null })
  })

  it('no pending draft: nothing to record', async () => {
    const { db, calls } = fakeDb({ select: [{ data: [], error: null }] })
    expect(await recordBoardDecisionOnReview(db, { orgId: ORG, arcId: ARC, userId: 'u1', decision: 'approved' })).toEqual({ ok: true, recorded: 0 })
    expect(calls).toHaveLength(1)
  })

  it('a read failure is logged by ids and code only, never throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ select: [{ data: null, error: { code: '42501', message: 'secret details' } }] })
    expect(await recordBoardDecisionOnReview(db, { orgId: ORG, arcId: ARC, userId: 'u1', decision: 'approved' })).toEqual({ ok: false })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret details')
    spy.mockRestore()
  })
})

describe('closeReviewsWithoutDecision', () => {
  it('completes pending drafts for the arc with a reason and no approval', async () => {
    const { db, calls } = fakeDb({ update: [{ data: null, error: null }] })
    expect(await closeReviewsWithoutDecision(db, { orgId: ORG, arcId: ARC, reason: 'withdrawn' })).toEqual({ ok: true })
    expect(calls[0]!.payload).toEqual({
      status: 'completed',
      human_feedback: 'Closed without a board decision: the resident withdrew the application.',
    })
    expect(calls[0]!.filters).toEqual(expect.arrayContaining([['eq', 'input->>arcRequestId', ARC], ['eq', 'status', 'pending_human_approval']]))
  })
})
