import { describe, expect, it } from 'vitest'
import { ALREADY_REVERSED_MESSAGE, markOriginalReversed, postJournalEntry } from './post-journal-entry'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// A stateful stand-in for journal_entries: one posted original, drafts as they are inserted,
// and conditional updates that apply the way the database applies them (check and write in one step).
function world() {
  const rows = new Map<string, Record<string, unknown>>([['orig', { id: 'orig', status: 'posted', reversed_by_id: null }]])
  const deleted: string[] = []
  const posted: string[] = []
  let n = 0

  const entries = () => {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let body: Record<string, unknown> = {}
    const conds: Array<[string, unknown]> = []
    const q: Record<string, unknown> = {}
    q.select = () => {
      if (op !== 'update') return q
      const hit = [...rows.values()].filter((r) => conds.every(([c, v]) => r[c] === v))
      for (const r of hit) Object.assign(r, body)
      return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
    }
    q.insert = (b: Record<string, unknown>) => {
      op = 'insert'
      body = { ...b, id: `draft-${++n}`, status: 'draft' }
      rows.set(body.id as string, body)
      return q
    }
    q.update = (b: Record<string, unknown>) => { op = 'update'; body = b; return q }
    q.delete = () => { op = 'delete'; return q }
    q.eq = (c: string, v: unknown) => { conds.push([c, v]); if (op === 'delete') { rows.delete(v as string); deleted.push(v as string) } return q }
    q.is = (c: string, v: unknown) => { conds.push([c, v]); return q }
    q.like = () => q
    q.order = () => q
    q.limit = async () => ({ data: [], error: null })
    q.single = async () => ({ data: { id: body.id }, error: null })
    q.then = (r: (v: unknown) => unknown) => {
      if (op === 'update' && body.status === 'posted') posted.push(String(conds[0]?.[1]))
      return r({ error: null })
    }
    return q
  }
  const other = () => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lte', 'gte', 'or']) q[m] = () => q
    q.limit = async () => ({ data: [], error: null })
    q.insert = async () => ({ error: null })
    return q
  }
  const client = { from: (t: string) => (t === 'journal_entries' ? entries() : other()), rpc: async () => ({ data: 'JE-2026-00001', error: null }) } as never
  return { rows, deleted, posted, client }
}

const input = {
  organizationId: U(1),
  associationId: U(2),
  fiscalPeriodId: U(3),
  entryDate: '2026-03-01',
  memo: 'Reversal of m',
  source: 'reversing' as const,
  reversesId: U(9),
  lines: [
    { accountId: U(4), fundId: U(5), debit: 0, credit: 10 },
    { accountId: U(6), fundId: U(5), debit: 10, credit: 0 },
  ],
}

describe('postJournalEntry beforePost', () => {
  it('of two concurrent reversals exactly one posts; the other draft is deleted with a friendly error', async () => {
    const w = world()
    const go = () => postJournalEntry(w.client, input, { beforePost: markOriginalReversed(w.client, 'orig') })
    const [a, b] = await Promise.all([go(), go()])

    expect([a.ok, b.ok].sort()).toEqual([false, true])
    const loser = a.ok ? b : a
    expect(loser).toEqual({ ok: false, error: ALREADY_REVERSED_MESSAGE })
    expect(w.posted).toHaveLength(1)
    expect(w.deleted).toHaveLength(1)
    const winner = a.ok ? a : b
    expect(w.rows.get('orig')).toMatchObject({ status: 'reversed', reversed_by_id: winner.ok ? winner.journalEntryId : null })
  })

  it('stores reverses_id on the draft header', async () => {
    const w = world()
    await postJournalEntry(w.client, input, { beforePost: markOriginalReversed(w.client, 'orig') })
    expect([...w.rows.values()].find((r) => r.id !== 'orig')).toMatchObject({ reverses_id: U(9) })
  })

  it('a failing hook deletes the draft and posts nothing', async () => {
    const w = world()
    const r = await postJournalEntry(w.client, input, { beforePost: async () => ({ ok: false, error: 'nope' }) })
    expect(r).toEqual({ ok: false, error: 'nope' })
    expect(w.deleted).toEqual(['draft-1'])
    expect(w.posted).toEqual([])
  })

  it('a throwing hook is treated as a failure too', async () => {
    const w = world()
    const r = await postJournalEntry(w.client, input, { beforePost: async () => { throw new Error('boom') } })
    expect(r.ok).toBe(false)
    expect(w.deleted).toEqual(['draft-1'])
  })
})
