import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A conditionally rendered error paragraph (`{error && <p className="text-danger">`)
 * is silent to a screen reader: the text appears but nothing announces it.
 * It needs role="alert" or aria-live, or should be the kit <Alert variant="error">.
 */
const here = path.dirname(fileURLToPath(import.meta.url))

// file (relative to src) -> reason it is allowed to stay silent.
const ALLOWLIST: Record<string, string> = {}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out)
    } else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

export function findSilentErrors(source: string): number[] {
  const hits: number[] = []
  const re = /<p\b([^>]*?)>/gs
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const attrs = m[1]
    if (!/text-danger|text-destructive/.test(attrs)) continue
    if (/role=|aria-live/.test(attrs)) continue
    const before = source.slice(Math.max(0, m.index - 80), m.index)
    if (/(&&|\?|:)\s*\(?\s*$/.test(before)) hits.push(source.slice(0, m.index).split('\n').length)
  }
  return hits
}

describe('inline error ratchet', () => {
  it('detects a silent conditional error paragraph', () => {
    expect(findSilentErrors('{error && <p className="text-sm text-danger">{error}</p>}')).toHaveLength(1)
    expect(findSilentErrors('{error && <p role="alert" className="text-danger">{error}</p>}')).toHaveLength(0)
  })

  it('every conditional text-danger paragraph is announced', () => {
    const offenders: string[] = []
    for (const file of walk(here)) {
      const rel = path.relative(here, file)
      if (rel in ALLOWLIST) continue
      for (const line of findSilentErrors(readFileSync(file, 'utf8'))) offenders.push(`${rel}:${line}`)
    }
    expect(offenders, 'add role="alert" or use <Alert variant="error">').toEqual([])
  })
})
