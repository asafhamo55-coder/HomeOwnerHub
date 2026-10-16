/**
 * Read EVERY row of a query, page by page — the jobs-package twin of
 * apps/hoa/src/lib/supabase/read-all.ts (jobs cannot import from an app).
 *
 * PostgREST caps each response at `max_rows` (1000) whatever range or
 * limit is asked for, silently. This walks the result until an EMPTY page
 * comes back (a short page is not the end when the cap is below the page
 * size). `page(from, to)` must build a fresh query with a stable order
 * each call. Throws on the first page error and past `maxRows`, so a job
 * never acts on a partial set as if it were the whole one (BL-047).
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
