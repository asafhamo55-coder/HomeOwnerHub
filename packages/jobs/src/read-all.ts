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
 *
 * Opt-in shortcut (same as the app twin): when the server cap is confirmed
 * (`serverCap`, or POSTGREST_MAX_ROWS), a page shorter than it is final
 * outright, so a single-page read is one round trip. Without a confirmed
 * cap nothing changes: only an empty page ends the read.
 */
export const PAGE_ROWS = 1000

/**
 * Opt-in: the rows PostgREST returns per response on this project, taken
 * from POSTGREST_MAX_ROWS. UNDEFINED unless that is a positive integer, and
 * then readAll keeps its original cap-safe probing (BL-047): the hosted
 * max_rows is a dashboard setting this code cannot see, and guessing it
 * wrong silently truncates money totals. Set it only after confirming the
 * value in Supabase (docs/owner-actions.md OA-46). Never above PAGE_ROWS.
 */
export function configuredServerCap(env: Record<string, string | undefined> = process.env): number | undefined {
  const raw = env.POSTGREST_MAX_ROWS
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined
  const n = Number(raw)
  return n > 0 ? Math.min(n, PAGE_ROWS) : undefined
}

interface PageResponse<T> {
  data: T[] | null
  error: { code?: string; message?: string } | null
}

export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  onError: (error: { code?: string; message?: string }) => Error,
  maxRows = 200_000,
  serverCap: number | undefined = configuredServerCap(),
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
    // Only with a CONFIRMED cap: shorter than what the server returns at once => nothing was cut.
    if (serverCap !== undefined && rows.length < Math.min(serverCap, PAGE_ROWS)) return out
  }
}
