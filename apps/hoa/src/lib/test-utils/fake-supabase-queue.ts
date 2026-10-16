// A queued-response variant of fake-supabase.ts, for tests of modules that
// issue several queries per table in a known order (claim, then undo):
// every chained call is recorded per `from(table)`, and awaiting the chain
// (or `.single()` / `.maybeSingle()`) resolves the NEXT canned response
// queued for that table. An exhausted queue rejects, like a thrown client.
// Enough to prove what a module asks for and how it treats a failure — not
// a database.

export type QueuedResp = { data: unknown; error: { code: string; message: string } | null; count?: number | null }

export interface QueuedCall {
  table: string
  ops: [string, unknown[]][]
}

const CHAIN_OPS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'is', 'order', 'range', 'limit', 'not', 'match']

export function queuedSupabase(responses: Record<string, QueuedResp[]>) {
  const calls: QueuedCall[] = []
  const db = {
    from(table: string) {
      const entry: QueuedCall = { table, ops: [] }
      calls.push(entry)
      const queue = responses[table] ?? []
      const next = () => {
        const r = queue.shift()
        return r ? Promise.resolve(r) : Promise.reject(new Error(`no canned response for ${table}`))
      }
      const builder: Record<string, unknown> = {}
      for (const op of CHAIN_OPS) {
        builder[op] = (...args: unknown[]) => {
          entry.ops.push([op, args])
          return builder
        }
      }
      for (const op of ['single', 'maybeSingle']) {
        builder[op] = () => {
          entry.ops.push([op, []])
          return next()
        }
      }
      builder.then = (resolve: (r: QueuedResp) => unknown, reject: (e: unknown) => unknown) => next().then(resolve, reject)
      return builder
    },
  }
  return { db, calls }
}

/** The payload passed to the first `op` call on `table` (insert/update). */
export function payloadOf(calls: QueuedCall[], table: string, op: 'insert' | 'update'): Record<string, unknown> | undefined {
  for (const c of calls) {
    if (c.table !== table) continue
    const found = c.ops.find(([name]) => name === op)
    if (found) return found[1][0] as Record<string, unknown>
  }
  return undefined
}
