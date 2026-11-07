/** Test-only: a tiny in-memory Supabase-style client that really applies eq / in / is filters. */
export type Row = Record<string, unknown>

export function fakeDb(tables: Record<string, Row[]>, log: Array<{ table: string; col: string; val: unknown }> = []) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (col: string, val: unknown) => {
        log.push({ table, col, val })
        rows = rows.filter((r) => r[col] === val)
        return q
      }
      q.in = (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]))
        return q
      }
      q.is = (col: string, val: unknown) => {
        rows = rows.filter((r) => (r[col] ?? null) === val)
        return q
      }
      q.order = () => q
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
      q.ilike = (col: string, pat: string) => {
        rows = rows.filter((r) => String(r[col] ?? '').toLowerCase() === pat.toLowerCase())
        return q
      }
      q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
      return q
    },
  }
}
