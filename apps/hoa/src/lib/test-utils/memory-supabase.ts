// In-memory stand-in for a supabase-js client, for unit tests of multi-table
// writes (lib/properties/lot.ts, lib/properties/import.ts) where what matters
// is the END STATE of every table — including after a failure was injected
// mid-way and the code compensated.
//
// Supports the subset those modules use: select / insert / update / delete;
// eq, neq, is, not(col,'is',null), in, ilike, lte, gte, lt, gt; order, range,
// limit; maybeSingle / single; { count: 'exact', head: true }. Rows are
// plain objects; select returns whole rows (column lists are ignored).
//
// `failOn` injects an error: return a PostgrestError-shaped object for the
// call you want to fail (by table + op + the call's index for that pair).

export type Row = Record<string, unknown>
export type MemOp = 'select' | 'insert' | 'update' | 'delete'

export interface MemCall {
  table: string
  op: MemOp
  filters: Array<[string, string, unknown]>
  payload?: unknown
}

export interface MemOptions {
  failOn?: (call: MemCall, nth: number) => { code: string; message: string } | null | undefined
}

type Filter = [method: string, column: string, value: unknown]

function likeToRegex(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) {
      out += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i++
    } else if (ch === '%') out += '.*'
    else if (ch === '_') out += '.'
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

function matches(row: Row, f: Filter): boolean {
  const [m, c, v] = f
  const x = row[c] ?? null
  switch (m) {
    case 'eq':
      return x === v
    case 'neq':
      return x !== v
    case 'is':
      return v === null ? x === null : x === v
    case 'not_is_null':
      return x !== null
    case 'in':
      return (v as unknown[]).includes(x)
    case 'ilike':
      return typeof x === 'string' && likeToRegex(String(v)).test(x)
    case 'lte':
      return x !== null && (x as string) <= (v as string)
    case 'lt':
      return x !== null && (x as string) < (v as string)
    case 'gte':
      return x !== null && (x as string) >= (v as string)
    case 'gt':
      return x !== null && (x as string) > (v as string)
    default:
      throw new Error(`memory-supabase: unsupported filter ${m}`)
  }
}

export function memorySupabase(seed: Record<string, Row[]> = {}, opts: MemOptions = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }))
  const calls: MemCall[] = []
  const counts = new Map<string, number>()
  let seq = 0
  let clock = Date.parse('2026-01-01T00:00:00Z')

  const table = (t: string) => (tables[t] ??= [])

  function builder(t: string) {
    let op: MemOp = 'select'
    let payload: unknown
    let returning = false
    let head = false
    let wantCount = false
    let single: 'many' | 'maybe' | 'single' = 'many'
    const filters: Filter[] = []
    const orders: Array<[string, boolean]> = []
    let range: [number, number] | null = null

    const run = () => {
      const call: MemCall = { table: t, op, filters: filters.map((f) => [...f] as Filter), payload }
      calls.push(call)
      const key = `${t}:${op}`
      const nth = counts.get(key) ?? 0
      counts.set(key, nth + 1)
      const injected = opts.failOn?.(call, nth)
      if (injected) return { data: null, error: injected, count: null }

      const rows = table(t)
      let result: Row[]
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[]
        result = list.map((r) => {
          clock += 1000
          const row = { id: `${t}-${++seq}`, created_at: new Date(clock).toISOString(), ...r }
          rows.push(row)
          return row
        })
      } else {
        const hit = rows.filter((r) => filters.every((f) => matches(r, f)))
        if (op === 'update') {
          for (const r of hit) Object.assign(r, payload as Row)
          result = hit
        } else if (op === 'delete') {
          tables[t] = rows.filter((r) => !hit.includes(r))
          result = hit
        } else {
          result = [...hit]
          for (const [col, asc] of [...orders].reverse()) {
            result.sort((a, b) => {
              const x = a[col] as string | null
              const y = b[col] as string | null
              if (x === y) return 0
              if (x === null) return 1
              if (y === null) return -1
              return (x < y ? -1 : 1) * (asc ? 1 : -1)
            })
          }
          if (range) result = result.slice(range[0], range[1] + 1)
        }
      }

      const count = wantCount ? result.length : null
      if (head) return { data: null, error: null, count }
      const shaped = result.map((r) => ({ ...r }))
      if (op !== 'select' && !returning) return { data: null, error: null, count }
      if (single === 'many') return { data: shaped, error: null, count }
      if (single === 'single' && shaped.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: 'not exactly one row' }, count }
      }
      if (single === 'maybe' && shaped.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'multiple rows' }, count }
      }
      return { data: shaped[0] ?? null, error: null, count }
    }

    const b: Record<string, unknown> = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (op === 'select') op = 'select'
        else returning = true
        if (o?.count) wantCount = true
        if (o?.head) head = true
        return b
      },
      insert(p: unknown) {
        op = 'insert'
        payload = p
        return b
      },
      update(p: unknown) {
        op = 'update'
        payload = p
        return b
      },
      delete() {
        op = 'delete'
        return b
      },
      eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), b),
      neq: (c: string, v: unknown) => (filters.push(['neq', c, v]), b),
      is: (c: string, v: unknown) => (filters.push(['is', c, v]), b),
      not: (c: string, o: string, v: unknown) => {
        if (o !== 'is' || v !== null) throw new Error('memory-supabase: only not(col, "is", null)')
        filters.push(['not_is_null', c, null])
        return b
      },
      in: (c: string, v: unknown[]) => (filters.push(['in', c, v]), b),
      ilike: (c: string, v: string) => (filters.push(['ilike', c, v]), b),
      lte: (c: string, v: unknown) => (filters.push(['lte', c, v]), b),
      lt: (c: string, v: unknown) => (filters.push(['lt', c, v]), b),
      gte: (c: string, v: unknown) => (filters.push(['gte', c, v]), b),
      gt: (c: string, v: unknown) => (filters.push(['gt', c, v]), b),
      order: (c: string, o?: { ascending?: boolean }) => (orders.push([c, o?.ascending !== false]), b),
      range: (from: number, to: number) => ((range = [from, to]), b),
      limit: (n: number) => ((range = [0, n - 1]), b),
      returns: () => b,
      maybeSingle: () => ((single = 'maybe'), b),
      single: () => ((single = 'single'), b),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad),
    }
    return b
  }

  const client = {
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }

  return {
    client,
    calls,
    rows: (t: string): Row[] => table(t).map((r) => ({ ...r })),
  }
}
