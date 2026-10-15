import { unstable_rethrow } from 'next/navigation'
import { redactText } from '@homeowner-portal/observability'
import { reportError } from '@homeowner-portal/observability/report'

/**
 * Make a failed read impossible to mistake for an empty one.
 *
 * The pattern this replaces:
 *
 *   const { data } = await supabase.from('hoa_violations').select(…)
 *   const rows = data ?? []
 *
 * Supabase does not throw on failure — it resolves `{ data: null, error }`.
 * Destructuring only `data` turns an RLS denial, a timeout or a renamed
 * column into `[]`, and the page renders "No violations on file". For a
 * treasurer, "no overdue dues" when the query failed is a wrong financial
 * answer (docs/specs/2026-10-15-enterprise-ux-plan.md, finding 1).
 *
 * `loadOrFail` returns a discriminated union, so a caller cannot reach the
 * rows without first deciding what to render when there are none to reach:
 *
 *   const res = await loadOrFail('violations', query)
 *   if (!res.ok) return <LoadFailed what="violations" />
 *   const rows = res.data
 *
 * The failure is reported (console + Sentry) here, once, with the error
 * code and a PII-redacted message — never row values, and nothing the page
 * shows the user. That is why the failure branch carries no error: the
 * page has nothing it should display from it.
 */
export type LoadResult<T> =
  | { ok: true; data: T; count: number | null }
  | { ok: false }

interface QueryError {
  code?: string
  message?: string
}

interface QueryResponse<T> {
  data: T | null
  error: QueryError | null
  count?: number | null
}

function report(what: string, code: string | undefined, message: string | undefined): void {
  const detail = message ? `: ${redactText(message)}` : ''
  reportError(new Error(`Failed to load ${what} (${code ?? 'no code'})${detail}`), 'load-or-fail', {
    what,
    code: code ?? null,
  })
}

/**
 * Await a Supabase query (anything resolving `{ data, error, count? }`).
 *
 * On success `data` is the query's own data type. For `head: true` count
 * queries `data` is null by design; read `count`.
 *
 * A query that REJECTS (network failure inside the client, a thrown
 * helper) is treated the same as one that resolved with an error.
 */
export async function loadOrFail<T>(
  what: string,
  query: PromiseLike<QueryResponse<T>>,
): Promise<LoadResult<T>> {
  let res: QueryResponse<T>
  try {
    res = await query
  } catch (e) {
    // redirect() / notFound() / dynamic-rendering bailouts are control
    // flow, not failures. Swallowing them would turn an auth redirect into
    // a "couldn't load" box.
    unstable_rethrow(e)
    report(what, 'thrown', e instanceof Error ? e.message : undefined)
    return { ok: false }
  }
  if (res.error) {
    report(what, res.error.code, res.error.message)
    return { ok: false }
  }
  return { ok: true, data: res.data as T, count: res.count ?? null }
}

/**
 * The same contract for a helper that THROWS on failure (most of
 * `lib/inbox/queries.ts`, `lib/properties/list.ts`) rather than returning
 * `{ error }`. Use it when the page should show `LoadFailed` in place
 * instead of handing the whole route to the error boundary.
 */
export async function tryLoad<T>(what: string, load: () => Promise<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await load(), count: null }
  } catch (e) {
    unstable_rethrow(e)
    report(what, 'thrown', e instanceof Error ? e.message : undefined)
    return { ok: false }
  }
}
