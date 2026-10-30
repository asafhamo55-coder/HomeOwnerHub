import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(__dirname, 'roadmap-table.tsx'), 'utf8')

describe('roadmap table on phones (WU-5)', () => {
  it('stacks rows into cards below sm and restores the table from sm up', () => {
    expect(src).toContain('block w-full sm:table')
    expect(src).toContain('hidden border-b')
    expect(src).toContain('sm:table-header-group')
    expect(src).toContain('sm:table-row-group')
    expect(src).toContain('flex flex-wrap')
    expect(src).toContain('sm:table-row')
  })

  it('keeps cell padding desktop-only so phones get no fixed 20px gutters', () => {
    expect(src).not.toMatch(/"px-5 py-4/)
    expect(src).not.toMatch(/'px-5 py-4/)
  })

  it('uses 14px for the workflow description', () => {
    expect(src).toMatch(/text-sm leading-relaxed text-muted/)
  })

  it('imports relatively so the root vitest config can resolve it', () => {
    expect(src).not.toContain("from '@/")
  })
})
