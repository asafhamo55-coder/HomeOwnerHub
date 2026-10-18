/**
 * TEST-ONLY in-memory stand-in for the slice of supabase-js the payment
 * plan code uses: select / eq / in / like / order / range, update (applied,
 * with `.select()` returning the changed rows) and insert (appended).
 * Embedded selects (`payments(amount)`, `unit:unit_id(...)`) are not
 * evaluated: fixture rows carry them pre-joined.
 */
type Row = Record<string, unknown>

export interface MemDb {
  db: { from: (table: string) => unknown }
  tables: Record<string, Row[]>
  writes: { table: string; op: 'update' | 'insert'; value: Row }[]
}

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${esc}$`, 's')
}

export function memDb(tables: Record<string, Row[]>, opts: { failTable?: string } = {}): MemDb {
  const writes: MemDb['writes'] = []
  const db = {
    from(table: string) {
      const preds: ((r: Row) => boolean)[] = []
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
      let mode: 'select' | 'update' | 'insert' = 'select'
      let patch: Row | null = null
      let selectAfterWrite = false
      const b: Record<string, unknown> = {}
      const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
        fn(...a)
        return b
      }
      b.select = chain(() => {
        if (mode !== 'select') selectAfterWrite = true
      })
      b.eq = chain((c, v) => preds.push((r) => r[c as string] === v))
      b.in = chain((c, v) => preds.push((r) => (v as unknown[]).includes(r[c as string])))
      b.like = chain((c, v) => {
        const re = likeToRegex(v as string)
        preds.push((r) => re.test(String(r[c as string] ?? '')))
      })
      b.is = chain((c, v) => preds.push((r) => (v === null ? r[c as string] == null : r[c as string] === v)))
      b.order = chain(() => {})
      b.range = chain((f, t) => {
        range = [f as number, t as number]
      })
      b.update = chain((v) => {
        mode = 'update'
        patch = v as Row
      })
      b.insert = chain((v) => {
        mode = 'insert'
        patch = v as Row
      })
      const run = () => {
        if (opts.failTable === table) return { data: null, error: { code: '57014', message: 'timeout' } }
        const rows = (tables[table] ??= [])
        if (mode === 'insert') {
          rows.push({ id: `${table}-${rows.length + 1}`, ...(patch as Row) })
          writes.push({ table, op: 'insert', value: patch as Row })
          return { data: null, error: null }
        }
        const hits = rows.filter((r) => preds.every((p) => p(r)))
        if (mode === 'update') {
          for (const r of hits) Object.assign(r, patch)
          writes.push({ table, op: 'update', value: patch as Row })
          return { data: selectAfterWrite ? hits.map((r) => ({ id: r.id })) : null, error: null }
        }
        return { data: hits.slice(range[0], range[1] + 1), error: null }
      }
      b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
      return b
    },
  }
  return { db, tables, writes }
}
