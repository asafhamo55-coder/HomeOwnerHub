import { describe, expect, it } from 'vitest'
import { getBallot, listBallots, type BallotClient } from './store'

/** Records the filters a query builder is given. Ids only. */
function fakeDb(rows: Record<string, unknown[]>) {
  const calls: Array<{ table: string; op: string; col: string; val: unknown }> = []
  const db: BallotClient = {
    from(table: string) {
      let data = rows[table] ?? []
      const q: Record<string, unknown> = {}
      const chain = () => q
      q.select = chain
      q.order = chain
      q.limit = chain
      q.in = (col: string, val: string[]) => {
        calls.push({ table, op: 'in', col, val })
        data = data.filter((r) => val.includes((r as Record<string, string>)[col]!))
        return q
      }
      q.eq = (col: string, val: unknown) => {
        calls.push({ table, op: 'eq', col, val })
        data = data.filter((r) => (r as Record<string, unknown>)[col] === val)
        return q
      }
      q.maybeSingle = () => Promise.resolve({ data: data[0] ?? null, error: null })
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res)
      return q
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
  return { db, calls }
}

const ballots = [
  { id: 'b1', association_id: 'a1', status: 'open' },
  { id: 'b2', association_id: 'a2', status: 'open' },
]

describe('ballot reads are scoped to the viewer associations', () => {
  it('lists only ballots of the given associations', async () => {
    const { db } = fakeDb({ ballots })
    const res = await listBallots(db, ['open'], ['a1'])
    expect(res.ok && res.data.map((b) => b.id)).toEqual(['b1'])
  })

  it('lists nothing when the viewer has no association', async () => {
    const { db } = fakeDb({ ballots })
    const res = await listBallots(db, ['open'], [])
    expect(res.ok && res.data).toEqual([])
  })

  it('does not return a ballot of another association by id, nor its options', async () => {
    const { db, calls } = fakeDb({ ballots, ballot_options: [{ ballot_id: 'b2', label: 'x' }] })
    const res = await getBallot(db, 'b2', ['a1'])
    expect(res).toEqual({ ok: true, data: null })
    expect(calls.some((c) => c.table === 'ballot_options')).toBe(false)
  })

  it('returns the ballot of the viewer association', async () => {
    const { db } = fakeDb({ ballots, ballot_options: [{ ballot_id: 'b1', label: 'x' }] })
    const res = await getBallot(db, 'b1', ['a1'])
    expect(res.ok && res.data?.ballot.id).toBe('b1')
  })

  it('board callers pass no scope and see everything', async () => {
    const { db } = fakeDb({ ballots })
    const res = await listBallots(db)
    expect(res.ok && res.data).toHaveLength(2)
  })
})
