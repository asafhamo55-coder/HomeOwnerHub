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

/** Split a long `.in()` list so the request URL stays well under proxy limits. */
export function chunk<T>(items: T[], size = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
