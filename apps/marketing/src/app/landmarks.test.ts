import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Ratchet: the site header (Nav) and footer must be siblings of <main>, not
// descendants, so screen-reader landmark lists and the skip link work.
const root = path.resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

const files = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))].filter((f) => f.endsWith('.tsx'))

describe('landmarks', () => {
  it('finds page files to scan', () => {
    expect(files.filter((f) => fs.readFileSync(f, 'utf8').includes('<main')).length).toBeGreaterThan(20)
  })

  it.each(files.map((f) => [path.relative(root, f), f]))('%s renders no <Nav or <Footer inside <main', (_n, f) => {
    const src = fs.readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<main\b[^>]*>([\s\S]*?)<\/main>/g)) {
      expect(m[1]).not.toMatch(/<Nav\b/)
      expect(m[1]).not.toMatch(/<Footer\b/)
    }
  })

  it('the skip link targets main-content and content-start is gone', () => {
    const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
    expect(layout).toContain('href="#main-content"')
    for (const f of walk(root)) expect(fs.readFileSync(f, 'utf8')).not.toContain('content-start')
  })
})
