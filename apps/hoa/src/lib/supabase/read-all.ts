/**
 * Read EVERY row of a query, page by page.
 *
 * PostgREST caps each response at `max_rows` (1000 here — supabase/
 * config.toml, and Supabase's hosted default) whatever range is asked
 * for: `.range(0, 49_999)` still returns at most 1000 rows, silently. A
 * total summed from that is a truncated total (UX decision 11). This
 * walks the result page by page until an EMPTY page comes back. Not a
 * short one: a server whose cap is below PAGE_ROWS returns short pages
 * that are not the end, so the next offset is however many rows actually
 * arrived. One extra round trip per read buys independence from the cap.
 *
 * `page(from, to)` must build a FRESH query each call with a stable
 * order (e.g. `.order('id')`), or rows can repeat or go missing between
 * pages. Throws on the first page error (via `onError`) and past
 * `maxRows`, so a caller never reports a partial sum as a whole one.
 */
export const PAGE_ROWS = 1000

interface PageResponse<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
}

export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  onError: (error: { code?: string; message?: string }) => Error,
  maxRows = 200_000,
): Promise<T[]> {
  const out: T[] = []
  for (;;) {
    const from = out.length
    if (from > maxRows) throw new Error(`readAll: more than ${maxRows} rows; refusing a partial result`)
    const { data, error } = await page(from, from + PAGE_ROWS - 1)
    if (error) throw onError(error)
    const rows = data ?? []
    if (rows.length === 0) return out
    out.push(...rows)
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
): Promise<{ data: T[] | null; error: QueryError | null }> {
  try {
    return { data: await readAll<T>(page, (e) => new PageReadError(e), maxRows), error: null }
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
