/**
 * Read EVERY row of a query, page by page.
 *
 * PostgREST caps each response at `max_rows` (1000 here — supabase/
 * config.toml, and Supabase's hosted default) whatever range is asked
 * for: `.range(0, 49_999)` still returns at most 1000 rows, silently. A
 * total summed from that is a truncated total (UX decision 11). This
 * walks the result page by page. A short page alone does not prove the
 * end: a server whose cap is below PAGE_ROWS returns short pages that
 * are not the last, so the next offset is however many rows actually
 * arrived.
 *
 * When it may stop without an empty probe page. Under any cap c, every
 * NON-final page holds exactly min(c, PAGE_ROWS) rows. So if an earlier
 * page held m rows and this page holds fewer than m, this page cannot be
 * a capped (non-final) one: it is the last, and we return. Until a page
 * larger than the current one has been seen (the first page, or a page
 * equal to the largest so far) a short page may still be capped, so we
 * fetch the next page; an empty page ends the read as before. Worst case
 * is unchanged; a multi-page read saves its trailing empty round trip.
 *
 * A page shorter than the known server cap is final outright (the first
 * page included), so the common single-page read is one round trip, not
 * two. `serverCap` below PAGE_ROWS keeps the guard above for that case.
 *
 * `page(from, to)` must build a FRESH query each call with a stable
 * order (e.g. `.order('id')`), or rows can repeat or go missing between
 * pages. Throws on the first page error (via `onError`) and past
 * `maxRows`, so a caller never reports a partial sum as a whole one.
 */
export const PAGE_ROWS = 1000

/**
 * The rows PostgREST returns per response on this project: max_rows = 1000
 * (supabase/config.toml and the hosted default). A page shorter than this
 * cannot have been cut by the cap, so it is the last one and needs no
 * probe. If the hosted setting is ever lowered, set POSTGREST_MAX_ROWS to
 * the new value (or pass `serverCap`) and the old probing returns for it.
 */
export function configuredServerCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.POSTGREST_MAX_ROWS)
  return Number.isInteger(n) && n > 0 ? Math.min(n, PAGE_ROWS) : PAGE_ROWS
}

interface PageResponse<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
}

export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  onError: (error: { code?: string; message?: string }) => Error,
  maxRows = 200_000,
  serverCap = configuredServerCap(),
): Promise<T[]> {
  const out: T[] = []
  let largest = 0 // most rows any earlier page returned
  for (;;) {
    const from = out.length
    if (from > maxRows) throw new Error(`readAll: more than ${maxRows} rows; refusing a partial result`)
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw onError(error)
    const rows = data ?? []
    if (rows.length === 0) return out
    out.push(...rows)
    // Shorter than what the server can return at once => nothing was cut.
    if (rows.length < Math.min(serverCap, PAGE_ROWS)) return out
    // Shorter than an earlier page => cannot be a capped page => final.
    if (rows.length < largest) return out
    largest = Math.max(largest, rows.length)
  }
}

type QueryError = { code?: string; message?: string }

class PageReadError extends Error {
  constructor(readonly queryError: QueryError) {
    super(`page read failed (${queryError.code ?? 'no code'})`)
  }
}

/**
 * `readAll` in the shape a Supabase query resolves to, for callers that
 * branch on `{ data, error }` (a Promise.all of queries, `loadOrFail`)
 * rather than catching a throw. On ANY failed page — or past `maxRows` —
 * `data` is null and `error` is set: there is no partial-success shape,
 * so a caller cannot sum a truncated result by accident.
 */
export async function readAllResult<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  maxRows?: number,
  serverCap?: number,
): Promise<{ data: T[] | null; error: QueryError | null }> {
  try {
    return { data: await readAll<T>(page, (e) => new PageReadError(e), maxRows, serverCap), error: null }
  } catch (e) {
    if (e instanceof PageReadError) return { data: null, error: e.queryError }
    return { data: null, error: { code: 'read_all', message: e instanceof Error ? e.message : 'read failed' } }
  }
}

/** Split a long `.in()` list so the request URL stays well under proxy limits. */
export function chunk<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
