import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// Static guards for WebKit/Safari layout bugs (found 2026-10-26: every click
// in the Properties table opened the LAST property, because a stretched link
// relied on `position: relative` on a <tr>, which Safari does not treat as a
// containing block). The owner uses Safari only, so these are enforced by
// scanning source rather than hoping a Chromium eyeball catches them.

const ROOT = resolve(__dirname, '../../../..')
const DIRS = ['apps/hoa/src', 'apps/marketing/src', 'packages/ui/src']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(p) && !/\.(test|stories)\.tsx$/.test(p)) out.push(p)
  }
  return out
}

const files = DIRS.flatMap((d) => walk(join(ROOT, d))).map((p) => ({
  path: relative(ROOT, p),
  src: readFileSync(p, 'utf8'),
}))

const rendersTable = (src: string) => /<(tr|td|th|tbody|thead)\b|<DataTable\b|rowClassName/.test(src)

describe('Safari: table rows are never positioning contexts', () => {
  it('scans a sane number of files', () => {
    expect(files.length).toBeGreaterThan(200)
  })

  it('no <tr>/<thead>/<tbody> carries relative, absolute or sticky', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of f.src.matchAll(/<(tr|thead|tbody)\b[^>]*?className=(?:"([^"]*)"|\{[^}]*\})/g)) {
        const attrs = m[0].replace(/^<\w+/, '')
        if (/(^|[\s'"`:])(relative|absolute|sticky)(?=$|[\s'"`])/.test(attrs)) {
          bad.push(`${f.path}: <${m[1]}> ${m[0].slice(0, 80)}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('no rowClassName callback returns relative/absolute/sticky', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of f.src.matchAll(/rowClassName\s*=\s*\{([^}]*)\}/g)) {
        if (/\b(relative|absolute|sticky)\b/.test(m[1])) bad.push(`${f.path}: ${m[0].slice(0, 80)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('stretched links are not used in table-rendering files, except PropertyList', () => {
    // PropertyList is allowed: it makes every <td> relative and is covered by
    // its own test. Anything else must do the same or live outside a table.
    const allowed = new Set(['apps/hoa/src/app/(dashboard)/properties/PropertyList.tsx'])
    const bad = files
      .filter((f) => rendersTable(f.src) && /after:absolute|absolute inset-0|after:inset-0/.test(f.src))
      .map((f) => f.path)
      .filter((p) => !allowed.has(p))
    expect(bad).toEqual([])
  })

  it('sticky is never applied to thead or tr (Safari: put it on th)', () => {
    const bad = files.filter((f) => /<(thead|tr)\b[^>]*\bsticky\b/.test(f.src)).map((f) => f.path)
    expect(bad).toEqual([])
  })
})
