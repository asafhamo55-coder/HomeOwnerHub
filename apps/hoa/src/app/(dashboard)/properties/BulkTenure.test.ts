import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BULK_TENURE_CAP,
  applySelection,
  barLabel,
  capMessage,
  confirmCopy,
  keepFailed,
  summarizeTenure,
} from '@/lib/properties/bulk-tenure-shared'

const here = path.dirname(fileURLToPath(import.meta.url))

describe('confirm wording', () => {
  it('names the count and the new tenure', () => {
    expect(confirmCopy(12, 'leased').title).toBe('Mark 12 homes as leased?')
    expect(confirmCopy(1, 'owner_occupied').title).toBe('Mark 1 home as owner-occupied?')
    expect(barLabel(12)).toBe('Set tenure for 12 homes')
  })
  it('has no em dashes in any copy', () => {
    const all = [
      confirmCopy(3, 'leased'),
      confirmCopy(3, 'owner_occupied'),
      { t: capMessage(250) },
      summarizeTenure(2, 1, 'leased'),
    ]
    expect(JSON.stringify(all)).not.toContain('—')
  })
  it('explains the cap', () => {
    expect(capMessage(250)).toContain(String(BULK_TENURE_CAP))
    expect(capMessage(250)).toContain('Deselect 50')
  })
})

describe('selection', () => {
  it('select all adds the page ids once, in order', () => {
    expect(applySelection(['b'], ['a', 'b', 'c'], true)).toEqual(['b', 'a', 'c'])
  })
  it('deselect removes only the given ids', () => {
    expect(applySelection(['a', 'b', 'c'], ['b'], false)).toEqual(['a', 'c'])
  })
  it('after a partial failure only the failed ids stay selected', () => {
    expect(keepFailed(['a', 'b', 'c'], ['c', 'x'])).toEqual(['c'])
  })
  it('summarises a partial failure with both counts', () => {
    const s = summarizeTenure(9, 3, 'leased')
    expect(s.tone).toBe('error')
    expect(s.text).toContain('9 homes updated')
    expect(s.text).toContain('3 could not be changed')
    expect(summarizeTenure(12, 0, 'leased').text).toBe('12 homes marked as leased.')
  })
})

describe('BulkTenure.tsx client file', () => {
  const src = readFileSync(path.join(here, 'BulkTenure.tsx'), 'utf8')
  const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
  it('is a client component', () => {
    expect(src.startsWith("'use client'")).toBe(true)
  })
  it('imports only react, next/navigation, the UI kit, the action and the pure shared module', () => {
    const allowed = new Set([
      'react',
      'next/navigation',
      '@homeowner-portal/ui',
      '@/lib/properties',
      '@/lib/properties/bulk-tenure-shared',
    ])
    expect(imports.filter((i) => !allowed.has(i))).toEqual([])
  })
  it('the shared module has no imports at all', () => {
    const shared = readFileSync(path.join(here, '../../../lib/properties/bulk-tenure-shared.ts'), 'utf8')
    expect(shared).not.toMatch(/^import /m)
  })
  it('the page only offers selection to board and admin', () => {
    const page = readFileSync(path.join(here, 'page.tsx'), 'utf8')
    expect(page).toContain("role === 'admin' || role === 'board'")
    expect(page).toContain('selectable={canBulk}')
  })
})
