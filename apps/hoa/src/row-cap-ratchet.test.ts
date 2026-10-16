import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Row-cap ratchet (BL-047).
 *
 * PostgREST caps EVERY response at max_rows (1000 — supabase/config.toml
 * and Supabase's hosted default) whatever the client asks for. So
 * `.range(0, 49_999)` or `.limit(5000)` does not read "everything": it
 * silently reads 1000 rows, and a total summed from it is wrong with no
 * sign. Read a full set with `readAll` / `readAllResult`
 * (lib/supabase/read-all.ts; packages/jobs/src/read-all.ts), or use a
 * count-only query (`{ count: 'exact', head: true }`).
 *
 * This scans source text for a single read that asks for more than the
 * cap: `.range(0, N)` with N ≥ 1000, or `.limit(N)` with N > 1000 — as a
 * literal, or a same-file numeric `const`. Crude by design (it cannot see
 * an unbounded `.select()` with no limit at all); it stops the specific
 * pattern that looked like a fix and was not. The allowlist can only
 * shrink: a listed file that no longer offends fails too.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const DIRS = ['apps/hoa/src', 'packages/jobs/src']

/** file → why it is tolerated for now. */
const ALLOWLIST: Record<string, string> = {}

const CAP = 1000

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

const num = (s: string) => Number(s.replace(/_/g, ''))

/** Offending snippets in `src` (comments stripped so prose can mention the pattern). */
function overCapReads(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const consts = new Map<string, number>()
  for (const m of code.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*([\d_]+)\b/g)) consts.set(m[1]!, num(m[2]!))
  const hits: string[] = []
  for (const m of code.matchAll(/\.range\(\s*0\s*,\s*([\d_]+)\s*\)/g)) {
    if (num(m[1]!) >= CAP) hits.push(m[0])
  }
  for (const m of code.matchAll(/\.limit\(\s*([\d_]+|[A-Z_][A-Z0-9_]*)\s*\)/g)) {
    const v = /^\d/.test(m[1]!) ? num(m[1]!) : consts.get(m[1]!)
    if (v !== undefined && v > CAP) hits.push(m[0])
  }
  return hits
}

describe('row-cap ratchet (BL-047)', () => {
  const files = DIRS.flatMap((d) => walk(path.join(repoRoot, d))).map((f) => ({
    rel: path.relative(repoRoot, f).split(path.sep).join('/'),
    src: readFileSync(f, 'utf8'),
  }))

  it('scans a plausible number of files (the walk is not silently empty)', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('no new single read asks for more rows than the server returns', () => {
    const offenders = files
      .filter((f) => !(f.rel in ALLOWLIST))
      .map((f) => ({ file: f.rel, hits: overCapReads(f.src) }))
      .filter((o) => o.hits.length > 0)
    expect(offenders, 'use readAll / readAllResult, or a count-only query').toEqual([])
  })

  it('allowlisted files still offend (delete the entry once fixed)', () => {
    const fixed = Object.keys(ALLOWLIST).filter((rel) => {
      const f = files.find((x) => x.rel === rel)
      return !f || overCapReads(f.src).length === 0
    })
    expect(fixed).toEqual([])
  })

  it('the detector catches the known shapes and ignores small ones', () => {
    expect(overCapReads('q.range(0, 49_999)')).toHaveLength(1)
    expect(overCapReads('q.range(0, 19_999)')).toHaveLength(1)
    expect(overCapReads('const MAX_X = 5000\nq.limit(MAX_X)')).toHaveLength(1)
    expect(overCapReads('q.limit(5000)')).toHaveLength(1)
    expect(overCapReads('q.range(0, 49)')).toHaveLength(0)
    expect(overCapReads('q.range(from, to)')).toHaveLength(0)
    expect(overCapReads('q.limit(1000)')).toHaveLength(0)
    expect(overCapReads('const LIMIT = 200\nq.limit(LIMIT)')).toHaveLength(0)
    expect(overCapReads('// was .range(0, 49_999)\nq.range(from, to)')).toHaveLength(0)
  })
})
