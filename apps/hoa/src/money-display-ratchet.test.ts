import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { usd } from '@/lib/money/format'

/**
 * Money is shown through `usd()` in `@/lib/money/format` (thousands commas,
 * two decimals). A hand-rolled dollar-sign template literal drops the comma
 * or the cents, so none may appear in app/ or components/. The allowlist can
 * only shrink: an entry whose file no longer offends fails the test.
 */
const MARKER = '$' + '${'
const ROOTS = ['app', 'components'].map((d) => join(__dirname, d))

// path relative to src/ -> reason it may keep a literal template
const ALLOWED: Record<string, string> = {}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const offenders = ROOTS.flatMap((r) => walk(r))
  .filter((f) => readFileSync(f, 'utf8').includes(MARKER))
  .map((f) => f.slice(__dirname.length + 1))
  .sort()

describe('money display ratchet', () => {
  it('has no unlisted dollar template literals', () => {
    expect(offenders.filter((f) => !(f in ALLOWED))).toEqual([])
  })
  it('allowlisted files still offend (the list only shrinks)', () => {
    expect(Object.keys(ALLOWED).filter((f) => !offenders.includes(f))).toEqual([])
  })
})

describe('money display strings', () => {
  it('puts a thousands comma on a dues balance', () => {
    expect(usd(1250)).toBe('$1,250.00')
  })
  it('renders a daily fine with cents', () => {
    expect(`${usd(12.5)} a day`).toBe('$12.50 a day')
  })
  it('keeps the cents on a proposed fine', () => {
    expect(`${usd(15050 / 100)} a day`).toBe('$150.50 a day')
  })
})
