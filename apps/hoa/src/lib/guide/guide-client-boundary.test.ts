/**
 * Perf ratchet (BL-099 page-speed pass): `src/generated/guide.ts` is ~1.9 MB of
 * compiled help articles. A `'use client'` file that reaches it, directly or
 * through any chain of value imports, ships the whole corpus to every browser
 * that loads the route (it once added ~500 kB to / and /resident). Only server
 * code and route handlers may load it.
 *
 * This walks the static import graph from every `'use client'` file and fails
 * with the offending chain. `import type` (and imports whose specifiers are all
 * `type`) are erased by the compiler, so they are not edges.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../..')
const GUIDE = join(SRC, 'generated/guide.ts')
const EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function resolveSpec(from: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec)
  else return null
  for (const e of ['', ...EXTS]) {
    try {
      if (statSync(base + e).isFile()) return base + e
    } catch {
      /* try next */
    }
  }
  return null
}

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+([^'";]*?)\s*from\s*['"]([^'"]+)['"]|(?:^|[^.\w])import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g

function valueImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const specs: string[] = []
  for (const m of text.matchAll(IMPORT_RE)) {
    if (m[2]) {
      const clause = m[1].trim()
      if (clause.startsWith('type ')) continue
      const named = clause.match(/^\{([^}]*)\}$/)
      if (named) {
        const items = named[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (items.length > 0 && items.every((s) => s.startsWith('type '))) continue
      }
      specs.push(m[2])
    } else if (m[3]) specs.push(m[3])
    else if (m[4]) specs.push(m[4])
  }
  return specs
}

const files = walk(SRC)
const isClient = (f: string) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(readFileSync(f, 'utf8'))

function chainToGuide(start: string): string[] | null {
  const seen = new Set<string>([start])
  const queue: string[][] = [[start]]
  while (queue.length) {
    const chain = queue.shift()!
    const cur = chain[chain.length - 1]
    for (const spec of valueImports(cur)) {
      const next = resolveSpec(cur, spec)
      if (!next || seen.has(next)) continue
      if (next === GUIDE) return [...chain, next]
      seen.add(next)
      queue.push([...chain, next])
    }
  }
  return null
}

describe('generated/guide.ts stays out of client bundles', () => {
  it('the generated module exists where the ratchet expects it', () => {
    expect(statSync(GUIDE).isFile()).toBe(true)
  })

  it("no 'use client' file reaches @/generated/guide", () => {
    const offenders: string[] = []
    for (const f of files.filter(isClient)) {
      const chain = chainToGuide(f)
      if (chain) offenders.push(chain.map((p) => p.slice(SRC.length + 1)).join(' -> '))
    }
    expect(offenders).toEqual([])
  })
})
