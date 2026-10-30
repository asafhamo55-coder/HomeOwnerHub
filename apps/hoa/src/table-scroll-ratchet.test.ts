import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * A hand-rolled `<table` must sit inside a horizontal scroll container, or a
 * wide table pushes the whole page sideways on a 375px phone. A .tsx file
 * that contains `<table` must also contain `overflow-x-auto`, `TableScroll`
 * or `DataTable`. Text scan only: it cannot tell which table a wrapper
 * covers, so a file with several tables is trusted to wrap all of them.
 */
const here = path.dirname(fileURLToPath(import.meta.url))

/** Files exempt from the rule. Each entry needs a reason. */
const ALLOWLIST: Record<string, string> = {
  'app/(dashboard)/meetings/[id]/election/print-kit.tsx':
    'Print-only ballot tally sheet; a fixed three-column form that is printed, not read on a phone.',
}

const SCROLLS = /overflow-x-auto|TableScroll|DataTable/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.tsx') && !/\.test\.tsx$/.test(name)) out.push(full)
  }
  return out
}

describe('table scroll ratchet', () => {
  it('wraps every <table in a horizontal scroll container', () => {
    const offenders: string[] = []
    for (const file of walk(here)) {
      const rel = path.relative(here, file).split(path.sep).join('/')
      const src = readFileSync(file, 'utf8')
      if (!src.includes('<table') || SCROLLS.test(src) || rel in ALLOWLIST) continue
      offenders.push(rel)
    }
    expect(offenders, 'wrap in <TableScroll> from @homeowner-portal/ui, or allowlist with a reason').toEqual([])
  })

  it('allowlist only names files that still need the exemption', () => {
    const stale = Object.keys(ALLOWLIST).filter((k) => {
      try {
        const s = readFileSync(path.join(here, k), 'utf8')
        return !s.includes('<table') || SCROLLS.test(s)
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })
})
