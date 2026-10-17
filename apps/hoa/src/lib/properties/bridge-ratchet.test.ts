/**
 * Ratchets for the two-table property model (C0.1).
 *
 * 1. `units.legacy_hoa_property_id` is the bridge between a lot's two rows.
 *    Reading it directly means a page picks its own rule for 0 / many
 *    units (the old detail page's `.maybeSingle()` crashed on 2). Bridge
 *    lookups go through lib/properties/resolve.ts; the files below still
 *    read the column themselves and may only ever read it LESS.
 *
 * 2. A hand-built `/properties/${…}` link is how a unit id ended up in a
 *    property URL (07160ec). Links go through propertyHref (href.ts).
 *
 * Shrink-only: a new file, or a higher count, fails. A LOWER count fails
 * too, with a message asking you to lower the number here, so the
 * allowlist never keeps headroom someone else can quietly spend.
 *
 * Counted: non-test .ts/.tsx under apps/hoa/src and packages/<pkg>/src,
 * excluding comment lines and the generated database types.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')

/** The bridge module itself: unlimited, it IS the seam. */
const BRIDGE_MODULE = new Set([
  'apps/hoa/src/lib/properties/resolve.ts',
  'apps/hoa/src/lib/properties/lot.ts',
  'apps/hoa/src/lib/properties/import.ts',
])

const LEGACY_COLUMN_ALLOWLIST: Record<string, number> = {
  'apps/hoa/src/lib/communications/audience.ts': 14,
  'apps/hoa/src/lib/dashboard/queries.ts': 5,
  // A column list for the data export, not a lookup.
  'apps/hoa/src/lib/data-export/tables.ts': 1,
  'apps/hoa/src/lib/inbox/match.ts': 3,
  'apps/hoa/src/lib/inbox/queries.ts': 2,
  'apps/hoa/src/lib/leases.ts': 8,
  'apps/hoa/src/lib/resident-dashboard.ts': 3,
  'apps/hoa/src/lib/resident.ts': 4,
}

const HREF_ALLOWLIST: Record<string, number> = {
  'apps/hoa/src/lib/properties/href.ts': 1, // the helper itself
  // Owned by the parallel UI pass; marked `// P0: propertyHref` there.
  'apps/hoa/src/app/(dashboard)/properties/PropertyList.tsx': 1,
  'apps/hoa/src/app/(dashboard)/properties/[id]/PropertyPanel.tsx': 1,
  'apps/hoa/src/lib/search/records.ts': 2,
}

function sourceFiles(): string[] {
  const roots = [path.join(ROOT, 'apps/hoa/src')]
  const pkgs = path.join(ROOT, 'packages')
  for (const p of fs.readdirSync(pkgs)) {
    const src = path.join(pkgs, p, 'src')
    if (fs.existsSync(src)) roots.push(src)
  }
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.startsWith('database.types')) {
        out.push(full)
      }
    }
  }
  roots.forEach(walk)
  return out
}

function countCodeLines(pattern: RegExp): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    let n = 0
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      if (pattern.test(line)) n += 1
    }
    if (n > 0) counts.set(rel, n)
  }
  return counts
}

function ratchet(actual: Map<string, number>, allow: Record<string, number>, exempt: Set<string>, what: string): string[] {
  const problems: string[] = []
  for (const [file, n] of actual) {
    if (exempt.has(file)) continue
    const max = allow[file]
    if (max === undefined) problems.push(`${file}: ${n} new ${what} (not allowlisted)`)
    else if (n > max) problems.push(`${file}: ${n} ${what}, allowlist says ${max}`)
    else if (n < max) problems.push(`${file}: down to ${n} ${what} — lower its allowlist entry from ${max} to ${n}`)
  }
  for (const file of Object.keys(allow)) {
    if (!actual.has(file)) problems.push(`${file}: no ${what} left — delete its allowlist entry`)
  }
  return problems
}

describe('property bridge ratchet', () => {
  it('direct reads of units.legacy_hoa_property_id only shrink (use lib/properties/resolve.ts)', () => {
    const problems = ratchet(countCodeLines(/legacy_hoa_property_id/), LEGACY_COLUMN_ALLOWLIST, BRIDGE_MODULE, 'direct bridge read(s)')
    expect(problems).toEqual([])
  })

  it('hand-built /properties/${…} links only shrink (use propertyHref)', () => {
    const problems = ratchet(countCodeLines(/\/properties\/\$\{/), HREF_ALLOWLIST, new Set(), 'hand-built property link(s)')
    expect(problems).toEqual([])
  })
})
