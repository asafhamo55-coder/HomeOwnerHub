import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Ratchet: `format(new Date(ts), ...)` from date-fns formats in the runtime's
 * zone, which is UTC on Vercel, so "10:05 AM" shows as 2:05 PM and an evening
 * submission lands on the next day. Use `formatShortDate` / `formatDateTime`
 * (lib/format-datetime.ts) for timestamps and `formatDay` (lib/money/format.ts)
 * for date-only columns.
 *
 * ALLOWLIST may only shrink. Each entry needs a reason.
 */
const ALLOWLIST: Record<string, string> = {
  // Everything was converted. `format(new Date(), ...)` with no argument is
  // "now" math, not display of a stored timestamp, and is not matched.
}

const PATTERN = /(?<![.\w])format\(\s*new Date\((?!\))/

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('server-zone date formatting ratchet', () => {
  const appDir = __dirname
  const srcDir = join(appDir, '..')
  const offenders = walk(appDir, [])
    .filter((f) => PATTERN.test(readFileSync(f, 'utf8')))
    .map((f) => relative(srcDir, f))
    .sort()

  it('has no new format(new Date(ts)) uses outside the allowlist', () => {
    const fresh = offenders.filter((f) => !(f in ALLOWLIST))
    expect(fresh).toEqual([])
  })

  it('keeps the allowlist honest: every entry still offends', () => {
    const stale = Object.keys(ALLOWLIST).filter((f) => !offenders.includes(f))
    expect(stale).toEqual([])
  })
})
