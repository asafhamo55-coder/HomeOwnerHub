import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * CSV ratchet (BL-045).
 *
 * Every CSV this app produces goes through `lib/csv.ts`, which quotes per
 * RFC 4180 AND neutralises spreadsheet formulas (a cell starting with
 * = + - @ tab or CR gets a leading apostrophe). A hand-rolled escaper is
 * how a route ends up shipping `=HYPERLINK(...)` straight into a board
 * member's Excel, so this test fails when a file:
 *
 *  1. serves CSV (a response or Blob typed `text/csv`) without importing
 *     `@/lib/csv`, or
 *  2. defines its own escaper — a `csvEscape`-style function, or the
 *     RFC 4180 quote-doubling `.replace(/"/g, '""')` — anywhere but
 *     lib/csv.ts.
 *
 * Crude by design: it reads source text, comments stripped. A file input's
 * `accept=".csv,text/csv"` is not a producer and is ignored. The allowlist
 * can only shrink: a listed file that no longer offends fails too.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const DIRS = ['apps/hoa/src']
const HELPER = 'apps/hoa/src/lib/csv.ts'

/** file → why it is tolerated for now. */
const ALLOWLIST: Record<string, string> = {}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Why `src` counts as a hand-built CSV producer; empty when it does not. */
export function handBuiltCsv(src: string): string[] {
  const code = stripComments(src)
  const reasons: string[] = []
  const usesHelper = /from\s+['"](@\/lib\/csv|(\.\.?\/)+(lib\/)?csv)['"]/.test(code)
  // A response or Blob typed as CSV: `'Content-Type': 'text/csv…'`,
  // `headers.set('content-type', 'text/csv')`, `new Blob(x, { type: 'text/csv' })`.
  // A MIME lookup table (`csv: 'text/csv'`) or an `accept=` attribute is not.
  const servesCsv = /(content-type|\btype)['"`]?\s*[:,]\s*['"`]text\/csv/i.test(code)
  if (servesCsv && !usesHelper) reasons.push('serves CSV without importing @/lib/csv')
  if (/\bfunction\s+csv(Escape|Quote|Cell|Field)\b|\bconst\s+csv(Escape|Quote|Field)\s*=/.test(code)) {
    reasons.push('defines its own CSV escaper')
  }
  if (/\.replace\(\s*\/"\/g\s*,\s*['"`]""['"`]\s*\)/.test(code)) reasons.push('hand-rolls RFC 4180 quote doubling')
  return reasons
}

describe('handBuiltCsv detector', () => {
  it('flags a route that sets text/csv and escapes by hand', () => {
    const src = `
      function csvEscape(v) { return \`"\${v.replace(/"/g, '""')}"\` }
      return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })`
    expect(handBuiltCsv(src)).toEqual([
      'serves CSV without importing @/lib/csv',
      'defines its own CSV escaper',
      'hand-rolls RFC 4180 quote doubling',
    ])
  })

  it('flags a client-side CSV Blob and a headers.set call', () => {
    expect(handBuiltCsv("new Blob([rows.join('\\n')], { type: 'text/csv' })")).toEqual([
      'serves CSV without importing @/lib/csv',
    ])
    expect(handBuiltCsv("res.headers.set('content-type', 'text/csv')")).toEqual([
      'serves CSV without importing @/lib/csv',
    ])
  })

  it('passes a route that uses the helper', () => {
    const src = `import { csvDocument } from '@/lib/csv'
      return new Response(csvDocument(h, rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })`
    expect(handBuiltCsv(src)).toEqual([])
  })

  it('ignores a file input that merely accepts CSV, and prose in comments', () => {
    expect(handBuiltCsv('<input accept=".csv,text/csv" />')).toEqual([])
    expect(handBuiltCsv("const MIME = { csv: 'text/csv', pdf: 'application/pdf' }")).toEqual([])
    expect(handBuiltCsv("// we used to send 'text/csv' by hand")).toEqual([])
  })
})

describe('CSV ratchet (BL-045)', () => {
  const files = DIRS.flatMap((d) => walk(path.join(repoRoot, d))).map((f) => ({
    rel: path.relative(repoRoot, f).split(path.sep).join('/'),
    src: readFileSync(f, 'utf8'),
  }))

  it('scans a plausible number of files (the walk is not silently empty)', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.rel === HELPER)).toBe(true)
  })

  it('no file builds CSV by hand — use csvDocument / csvLine from @/lib/csv', () => {
    const offenders = files
      .filter((f) => f.rel !== HELPER && !(f.rel in ALLOWLIST))
      .map((f) => ({ file: f.rel, reasons: handBuiltCsv(f.src) }))
      .filter((o) => o.reasons.length > 0)
    expect(offenders).toEqual([])
  })

  it('the four list exports use the shared helper', () => {
    for (const area of ['properties', 'violations', 'leases', 'vendors']) {
      const f = files.find((x) => x.rel === `apps/hoa/src/app/(dashboard)/${area}/export/route.ts`)
      expect(f, area).toBeDefined()
      expect(f!.src, area).toMatch(/from '@\/lib\/csv'/)
    }
  })

  it('allowlisted files still offend (delete the entry once fixed)', () => {
    const stale = Object.keys(ALLOWLIST).filter((rel) => {
      const f = files.find((x) => x.rel === rel)
      return !f || handBuiltCsv(f.src).length === 0
    })
    expect(stale).toEqual([])
  })
})
