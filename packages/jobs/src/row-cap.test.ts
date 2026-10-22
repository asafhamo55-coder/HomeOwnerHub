import { describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(),
  loadAccountingRefs: vi.fn(),
  postJournalEntry: vi.fn(),
}))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  fetchOrgSandbox: vi.fn(),
  OUTBOUND_BLOCKED_ERROR: 'blocked',
}))

const { findUnchargedDefaults } = await import('./hoa-late-fees')
const { supabaseReminderStore } = await import('./dues-reminders/run')

/**
 * BL-047 for the jobs that ACT on a full set of rows. The fake caps every
 * response at 1000 rows like PostgREST's max_rows and evaluates the few
 * filters used here; `failOn` fails a read matching a predicate.
 */
type Row = Record<string, unknown>
function cappedDb(tables: Record<string, Row[]>, failOn?: (table: string, from: number, ops: string[]) => boolean) {
  const inLists: number[] = []
  return {
    inLists,
    db: {
      from(table: string) {
        const preds: ((r: Row) => boolean)[] = []
        const ops: string[] = []
        let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
        const b: Record<string, unknown> = {}
        const chain = (name: string, fn?: (...a: unknown[]) => void) => (...a: unknown[]) => {
          ops.push(name)
          fn?.(...a)
          return b
        }
        b.select = chain('select')
        b.order = chain('order')
        b.eq = chain('eq', (c, v) => preds.push((r) => r[c as string] === v))
        b.neq = chain('neq', (c, v) => preds.push((r) => r[c as string] !== v))
        b.is = chain('is', (c, v) => preds.push((r) => (v === null ? r[c as string] == null : r[c as string] === v)))
        // Evaluates the `col.is.null,col.neq.<v>` OR form — the M3 (BL-136)
        // opening-balance skip. Anything else fails loudly rather than
        // silently matching every row.
        b.or = chain('or', (expr) => {
          const terms = String(expr)
            .split(',')
            .map((t) => {
              const m = /^(\w+)\.(is|neq)\.(.+)$/.exec(t)
              if (!m) throw new Error(`fake db: unsupported or() term ${t}`)
              const [, c, op, v] = m
              return op === 'is' && v === 'null' ? (r: Row) => r[c!] == null : (r: Row) => r[c!] != null && r[c!] !== v
            })
          preds.push((r) => terms.some((t) => t(r)))
        })
        b.lt = chain('lt', (c, v) => preds.push((r) => (r[c as string] as string) < (v as string)))
        b.in = chain('in', (c, v) => {
          inLists.push((v as unknown[]).length)
          preds.push((r) => (v as unknown[]).includes(r[c as string]))
        })
        b.limit = chain('limit', (n) => (range = [0, (n as number) - 1]))
        b.range = chain('range', (f, t) => (range = [f as number, t as number]))
        b.then = (resolve: (v: unknown) => unknown) => {
          if (failOn?.(table, range[0], ops)) return Promise.resolve({ data: null, error: { code: '414' } }).then(resolve)
          const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)))
          return Promise.resolve({ data: rows.slice(range[0], Math.min(range[1] + 1, range[0] + 1000)), error: null }).then(resolve)
        }
        return b
      },
    },
  }
}

const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
const TODAY = '2026-10-16'

// BL-147: the board policy's eligible types and grace cutoff.
const LATE_FILTER = { types: ['regular', 'special'], dueBefore: TODAY }

describe('findUnchargedDefaults (hoa-late-fees)', () => {
  const defaulted = Array.from({ length: 2500 }, (_, i) => ({
    id: id('a', i),
    association_id: 'assoc-1',
    status: 'open',
    due_date: '2026-09-01',
    assessment_type: 'regular',
    unit_id: 'u',
    fiscal_period_id: 'p',
    amount: 100,
  }))
  // 1200 of them already carry a late fee.
  const fees = Array.from({ length: 1200 }, (_, i) => ({
    id: id('f', i),
    association_id: 'assoc-1',
    status: 'open',
    due_date: TODAY,
    assessment_type: 'late_fee',
    memo_code: `LATE-${id('a', i)}`,
  }))

  it('sees every defaulted charge and every booked fee, in small id chunks', async () => {
    const { db, inLists } = cappedDb({ assessments: [...defaulted, ...fees] })
    const r = await findUnchargedDefaults(db as never, 'assoc-1', LATE_FILTER)
    expect(r.defaulted).toHaveLength(2500)
    expect(r.uncharged).toHaveLength(1300)
    expect(r.uncharged[0]!.id).toBe(id('a', 1200))
    expect(Math.max(...inLists.filter((n) => n !== 2))).toBeLessThanOrEqual(150)
  })

  it('a failed "already charged" read throws — never charges everyone again', async () => {
    const { db } = cappedDb({ assessments: [...defaulted, ...fees] }, (_t, _f, ops) =>
      ops.filter((o) => o === 'eq').length === 2 && ops.includes('in'),
    )
    await expect(findUnchargedDefaults(db as never, 'assoc-1', LATE_FILTER)).rejects.toThrow(/existing late fees read failed/)
  })

  it('a failed later page of defaulted charges throws', async () => {
    const { db } = cappedDb({ assessments: defaulted }, (_t, from) => from === 1000)
    await expect(findUnchargedDefaults(db as never, 'assoc-1', LATE_FILTER)).rejects.toThrow(/defaulted assessments read failed/)
  })

  // BL-136 (M3_APPLIED, now live): a balance carried over by the opening-
  // balances approval never earns a late fee. NULL source must stay in.
  const opening = Array.from({ length: 3 }, (_, i) => ({
    ...defaulted[0]!,
    id: id('o', i),
    source: 'opening_balance',
  }))
  const tagged = { ...defaulted[0]!, id: id('t', 0), source: 'manual' }

  it('by default (M3 live) skips opening balances but keeps NULL and other sources', async () => {
    const { db } = cappedDb({ assessments: [...defaulted, ...opening, tagged] })
    const r = await findUnchargedDefaults(db as never, 'assoc-1', LATE_FILTER)
    expect(r.defaulted).toHaveLength(2501)
    expect(r.defaulted.some((a) => a.id.startsWith('o'))).toBe(false)
    expect(r.defaulted.some((a) => a.id === tagged.id)).toBe(true)
  })

  it('flag off (pre-M3): issues no source predicate and charges opening balances like any other', async () => {
    const { db } = cappedDb({ assessments: [...defaulted, ...opening] })
    const r = await findUnchargedDefaults(db as never, 'assoc-1', LATE_FILTER, false)
    expect(r.defaulted).toHaveLength(2503)
  })
})

describe('supabaseReminderStore.loadOpenAssessments (dues reminders)', () => {
  const open = Array.from({ length: 2100 }, (_, i) => ({
    id: id('a', i),
    association_id: 'assoc-1',
    status: 'open',
    deleted_at: null,
    unit_id: 'u',
    amount: 100,
    due_date: '2026-09-01',
    assessment_type: 'regular',
    payments: [],
    unit: null,
  }))

  it('returns every open charge past the 1000-row cap', async () => {
    const { db } = cappedDb({ assessments: open })
    const rows = await supabaseReminderStore(db).loadOpenAssessments('assoc-1')
    expect(rows).toHaveLength(2100)
  })

  it('a failed later page throws', async () => {
    const { db } = cappedDb({ assessments: open }, (_t, from) => from === 1000)
    await expect(supabaseReminderStore(db).loadOpenAssessments('assoc-1')).rejects.toThrow(/assessments/)
  })
})
