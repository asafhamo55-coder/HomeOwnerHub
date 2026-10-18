import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * TEST-ONLY stand-in for the Supabase client that behaves like PostgREST
 * where BL-047 matters: every response is capped at `cap` rows (max_rows =
 * 1000 in supabase/config.toml) WHATEVER `.range()` / `.limit()` asks for,
 * and a query with no range at all still gets only the first `cap`.
 *
 * Simple filters are evaluated against the fixture rows (eq, neq, is, in,
 * lt, lte, gt, gte, not-in, not-is) so a test can also prove the
 * predicate. `{ count: 'exact', head: true }` returns the filtered count
 * with no rows. Every builder call is recorded in `calls`.
 *
 * Not imported by app code — lives beside read-all.ts so every test that
 * needs a capped client shares one definition.
 */
export interface FakeCall {
  table: string
  ops: [string, ...unknown[]][]
}

export interface FakeDbOptions {
  cap?: number
  /** Fail the read of `table` whose range starts at `from` (any read when omitted). */
  failAt?: { table: string; from?: number }
}

type Row = Record<string, unknown>
type Pred = (r: Row) => boolean

function parseList(v: string): string[] {
  return v
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
}

export function cappedFakeDb(
  tables: Record<string, Row[]>,
  opts: FakeDbOptions = {},
): { db: SupabaseClient; calls: FakeCall[] } {
  const cap = opts.cap ?? 1000
  const calls: FakeCall[] = []
  const db = {
    from(table: string) {
      const call: FakeCall = { table, ops: [] }
      calls.push(call)
      const preds: Pred[] = []
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
      let head = false
      let countMode = false
      let orderCol: string | null = null
      const builder: Record<string, unknown> = {}
      const rec =
        (m: string, fn?: (...a: unknown[]) => void) =>
        (...args: unknown[]) => {
          call.ops.push([m, ...args])
          fn?.(...args)
          return builder
        }
      builder.select = rec('select', (_cols, o) => {
        const so = o as { count?: string; head?: boolean } | undefined
        countMode = so?.count === 'exact'
        head = so?.head === true
      })
      builder.eq = rec('eq', (c, v) => preds.push((r) => r[c as string] === v))
      builder.neq = rec('neq', (c, v) => preds.push((r) => r[c as string] !== v))
      builder.is = rec('is', (c, v) => preds.push((r) => (v === null ? r[c as string] == null : r[c as string] === v)))
      builder.in = rec('in', (c, v) => preds.push((r) => (v as unknown[]).includes(r[c as string])))
      builder.lt = rec('lt', (c, v) => preds.push((r) => (r[c as string] as string) < (v as string)))
      builder.lte = rec('lte', (c, v) => preds.push((r) => (r[c as string] as string) <= (v as string)))
      builder.gt = rec('gt', (c, v) => preds.push((r) => (r[c as string] as string) > (v as string)))
      builder.gte = rec('gte', (c, v) => preds.push((r) => (r[c as string] as string) >= (v as string)))
      builder.not = rec('not', (c, op, v) => {
        if (op === 'in') {
          const list = parseList(v as string)
          preds.push((r) => !list.includes(String(r[c as string])))
        } else if (op === 'is' && v === null) {
          preds.push((r) => r[c as string] != null)
        }
      })
      // `.or()` is recorded but not evaluated.
      builder.or = rec('or')
      builder.order = rec('order', (c) => {
        orderCol = orderCol ?? (c as string)
      })
      builder.limit = rec('limit', (n) => {
        range = [range[0], range[0] + (n as number) - 1]
      })
      builder.range = rec('range', (f, t) => {
        range = [f as number, t as number]
      })
      // Writes are recorded, not applied: a test asserts on `calls`.
      let inserted: Row | null = null
      builder.insert = rec('insert', (v) => {
        inserted = v as Row
      })
      builder.update = rec('update')
      builder.delete = rec('delete')
      const one = (strict: boolean) => () => {
        call.ops.push([strict ? 'single' : 'maybeSingle'])
        if (opts.failAt && opts.failAt.table === table && opts.failAt.from === undefined) {
          return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } })
        }
        if (inserted) return Promise.resolve({ data: { id: `${table}-inserted`, ...inserted }, error: null })
        const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)))
        const data = rows[0] ?? null
        const error = strict && !data ? { code: 'PGRST116', message: 'no rows' } : null
        return Promise.resolve({ data, error })
      }
      builder.maybeSingle = one(false)
      builder.single = one(true)
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        if (opts.failAt && opts.failAt.table === table && (opts.failAt.from === undefined || opts.failAt.from === range[0])) {
          return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' }, count: null }).then(resolve, reject)
        }
        let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)))
        if (orderCol) {
          const col = orderCol
          rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])))
        }
        const count = countMode ? rows.length : null
        if (head) return Promise.resolve({ data: null, error: null, count }).then(resolve, reject)
        const end = Math.min(range[1] + 1, range[0] + cap)
        return Promise.resolve({ data: rows.slice(range[0], end), error: null, count }).then(resolve, reject)
      }
      return builder
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

/** The `[from, to]` of every `.range()` issued against `table`. */
export function rangesFor(calls: FakeCall[], table: string): [number, number][] {
  return calls
    .filter((c) => c.table === table)
    .flatMap((c) => c.ops.filter((o) => o[0] === 'range').map((o) => [o[1] as number, o[2] as number] as [number, number]))
}
