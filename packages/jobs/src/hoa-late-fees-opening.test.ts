import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-136 (migration 0067): the nightly late-fee job skips charges the
// opening-balances approval carried over (assessments.source =
// 'opening_balance') once M3_APPLIED is on. Off, the query is unchanged
// (the column may not exist yet).

const flag = vi.hoisted(() => ({ on: false }))
vi.mock('@homeowner-portal/db/m3', () => ({
  get M3_APPLIED() {
    return flag.on
  },
}))
vi.mock('./client', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(),
  loadAccountingRefs: vi.fn(),
  postJournalEntry: vi.fn(),
}))

const { findUnchargedDefaults, OPENING_BALANCE_SOURCE } = await import('./hoa-late-fees')

type Row = Record<string, unknown>

/** Evaluates the handful of filters findUnchargedDefaults uses, including the `.or()` it adds. */
function fakeDb(rows: Row[]) {
  const orCalls: string[] = []
  return {
    orCalls,
    db: {
      from() {
        const preds: ((r: Row) => boolean)[] = []
        let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
        const b: Record<string, unknown> = {}
        const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => {
          fn?.(...a)
          return b
        }
        b.select = chain()
        b.order = chain()
        b.range = chain((f, t) => (range = [f as number, t as number]))
        b.eq = chain((c, v) => preds.push((r) => r[c as string] === v))
        b.neq = chain((c, v) => preds.push((r) => r[c as string] !== v))
        b.lt = chain((c, v) => preds.push((r) => (r[c as string] as string) < (v as string)))
        b.in = chain((c, v) => preds.push((r) => (v as unknown[]).includes(r[c as string])))
        b.or = chain((expr) => {
          orCalls.push(expr as string)
          const alts = (expr as string).split(',').map((part) => {
            const [col, op, ...rest] = part.split('.')
            const val = rest.join('.')
            if (op === 'is' && val === 'null') return (r: Row) => r[col!] == null
            if (op === 'neq') return (r: Row) => r[col!] != null && r[col!] !== val
            throw new Error(`unsupported or() part ${part}`)
          })
          preds.push((r) => alts.some((a) => a(r)))
        })
        b.then = (resolve: (v: unknown) => unknown) =>
          Promise.resolve({
            data: rows.filter((r) => preds.every((p) => p(r))).slice(range[0], range[1] + 1),
            error: null,
          }).then(resolve)
        return b
      },
    },
  }
}

const TODAY = '2026-10-20'
const base = { association_id: 'assoc-1', status: 'open', due_date: '2026-09-01', assessment_type: 'regular', unit_id: 'u', fiscal_period_id: 'p', amount: 100 }
const ROWS: Row[] = [
  { ...base, id: 'dues', source: null },
  { ...base, id: 'carried', source: 'opening_balance' },
]

beforeEach(() => {
  flag.on = false
})

describe('findUnchargedDefaults and opening balances (BL-136)', () => {
  it('exports the same marker the opening-balances executor writes', () => {
    expect(OPENING_BALANCE_SOURCE).toBe('opening_balance')
  })

  it('flag off: no source filter, so behaviour is exactly as before 0067', async () => {
    const { db, orCalls } = fakeDb(ROWS)
    const r = await findUnchargedDefaults(db as never, 'assoc-1', TODAY)
    expect(orCalls).toEqual([])
    expect(r.uncharged.map((a) => a.id).sort()).toEqual(['carried', 'dues'])
  })

  it('flag on: a carried-over opening charge is never late-fee eligible; ordinary dues still are', async () => {
    flag.on = true
    const { db, orCalls } = fakeDb(ROWS)
    const r = await findUnchargedDefaults(db as never, 'assoc-1', TODAY)
    // Once per page of the defaulted read.
    expect(orCalls.length).toBeGreaterThan(0)
    expect(new Set(orCalls)).toEqual(new Set(['source.is.null,source.neq.opening_balance']))
    expect(r.defaulted.map((a) => a.id)).toEqual(['dues'])
    expect(r.uncharged.map((a) => a.id)).toEqual(['dues'])
  })

  it('the explicit argument wins over the flag', async () => {
    const { db } = fakeDb(ROWS)
    const r = await findUnchargedDefaults(db as never, 'assoc-1', TODAY, true)
    expect(r.defaulted.map((a) => a.id)).toEqual(['dues'])
  })
})
