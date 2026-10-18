import { describe, expect, it, vi } from 'vitest'
import { loadArcReview } from './load'

type Resp = { data: unknown; error: { code: string } | null }

function fakeDb(responses: Resp[]) {
  const calls: Array<Array<[string, unknown[]]>> = []
  const db = {
    from() {
      const ops: Array<[string, unknown[]]> = []
      calls.push(ops)
      const b: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'order', 'limit']) b[op] = (...a: unknown[]) => (ops.push([op, a]), b)
      const next = () => Promise.resolve(responses.shift() ?? { data: null, error: null })
      b.maybeSingle = next
      b.then = (res: (r: Resp) => unknown, rej: (e: unknown) => unknown) => next().then(res, rej)
      return b
    },
  }
  return { db: db as never, calls }
}

const OUT = { mode: 'review', status: 'answered', summary: 's', confidence: 'HIGH', rules: [], questions: [], missingInfo: [], suggestion: null, warnings: [], disclaimer: 'd' }
const PRE = { ...OUT, mode: 'precheck' }
const ROW = { id: 'r1', status: 'pending_human_approval', created_at: null, input: { arcRequestId: 'a1', precheckRunId: 'p1' }, output: OUT, human_approved: null, human_feedback: null }

describe('loadArcReview', () => {
  it('reads the latest review for the arc in the org, then the resident’s pre-check by id', async () => {
    const { db, calls } = fakeDb([{ data: [ROW], error: null }, { data: { output: PRE }, error: null }])
    const r = await loadArcReview(db, 'org-1', 'a1')
    expect(r).toMatchObject({ ok: true, review: { runId: 'r1', state: 'pending' }, precheck: { mode: 'precheck' } })
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        ['eq', ['organization_id', 'org-1']],
        ['eq', ['workflow_id', 'W37']],
        ['eq', ['input->>arcRequestId', 'a1']],
        ['eq', ['input->>mode', 'review']],
        ['order', ['created_at', { ascending: false }]],
      ]),
    )
    expect(calls[1]).toEqual(expect.arrayContaining([['eq', ['id', 'p1']], ['eq', ['input->>mode', 'precheck']]]))
  })

  it('no review: no pre-check lookup', async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }])
    expect(await loadArcReview(db, 'org-1', 'a1')).toEqual({ ok: true, review: null, precheck: null })
    expect(calls).toHaveLength(1)
  })

  it('a failed read is { ok: false }, logged by code only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb([{ data: null, error: { code: '42501' } }])
    expect(await loadArcReview(db, 'org-1', 'a1')).toEqual({ ok: false })
    spy.mockRestore()
  })
})
