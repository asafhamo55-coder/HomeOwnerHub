/**
 * TEST-ONLY: wrap a fake Supabase client so a test can prove which queries
 * are SENT while another one is still in flight (BL-099 static pass).
 *
 * A PostgREST builder is lazy: nothing goes over the wire until something
 * calls its `then()`. This wrapper records every `then()` (a query that was
 * sent) in `started`, and makes the queries against `held` tables wait
 * until `release()` is called. A loader whose reads run in parallel has
 * all of them in `started` while the held one is pending; a loader that
 * awaits them one after another has only the held one.
 *
 * Same idea as the `holds` map in lib/search/records.test.ts, as a wrapper
 * so it composes with cappedFakeDb (or any other fake).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = { from: (table: string) => any }

export interface HeldDb<D> {
  db: D
  /** Tables whose queries were sent, in order, one entry per query. */
  started: string[]
  /** Let the held queries resolve. */
  release: () => void
}

export function heldDb<D extends AnyDb>(inner: D, held: readonly string[]): HeldDb<D> {
  const started: string[] = []
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  const wrap = (table: string, builder: Record<string | symbol, unknown>): unknown =>
    new Proxy(builder, {
      get(target, prop) {
        const value = target[prop]
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
            started.push(table)
            const run = () => (value as (a: unknown, b: unknown) => unknown).call(target, resolve, reject)
            return held.includes(table) ? gate.then(run) : run()
          }
        }
        if (typeof value !== 'function') return value
        if (prop === 'single' || prop === 'maybeSingle') {
          // These send the query themselves and hand back a plain promise.
          return (...args: unknown[]) => {
            started.push(table)
            const run = () => (value as (...a: unknown[]) => unknown).apply(target, args)
            return held.includes(table) ? gate.then(run) : run()
          }
        }
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          // Chained builder calls return the builder: keep it wrapped.
          return out === target ? wrap(table, target) : out
        }
      },
    })
  const db = {
    ...inner,
    from(table: string) {
      return wrap(table, inner.from(table))
    },
  } as unknown as D
  return { db, started, release }
}

/**
 * Let every promise chain that is not waiting on the gate settle. The
 * fakes resolve through microtasks only, so draining the microtask queue a
 * few hundred times is enough, and unlike a setTimeout it still works in
 * a file that uses fake timers.
 */
export async function settle(rounds = 500): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}
