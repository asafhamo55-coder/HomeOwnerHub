// Minimal recording stand-in for a supabase-js query builder, for unit
// tests that need to assert WHICH filters a query carried (e.g. that an
// impersonated service-role read is confined to one org).
//
// Every chained call is recorded as [method, ...args]. Awaiting the chain
// (or calling maybeSingle/single) asks `respond` for the result.

export type Op = [string, ...unknown[]]
export interface Recorded {
  table: string
  ops: Op[]
}
export type Responder = (q: Recorded) => { data: unknown; error: unknown } | undefined

export function fakeSupabase(respond: Responder = () => undefined) {
  const queries: Recorded[] = []

  function builder(rec: Recorded, single: 'many' | 'maybe' | 'single' = 'many'): unknown {
    const resolve = () => {
      const r = respond(rec) ?? { data: single === 'many' ? [] : null, error: null }
      if (single !== 'many' && Array.isArray(r.data)) return { ...r, data: r.data[0] ?? null }
      return r
    }
    return new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              Promise.resolve(resolve()).then(ok, bad)
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return (...args: unknown[]) => {
              rec.ops.push([prop, ...args])
              return builder(rec, prop === 'single' ? 'single' : 'maybe')
            }
          }
          return (...args: unknown[]) => {
            rec.ops.push([prop, ...args])
            return builder(rec, single)
          }
        },
      },
    )
  }

  const client = {
    from(table: string) {
      const rec: Recorded = { table, ops: [] }
      queries.push(rec)
      return builder(rec)
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }
  return { client, queries }
}

/** True when the recorded query carries `.eq(column, value)`. */
export function hasEq(q: Recorded, column: string, value: unknown): boolean {
  return q.ops.some(([m, c, v]) => m === 'eq' && c === column && v === value)
}

export function filterOn(q: Recorded, method: string, column: string): unknown[] | undefined {
  const op = q.ops.find(([m, c]) => m === method && c === column)
  return op ? op.slice(2) : undefined
}
