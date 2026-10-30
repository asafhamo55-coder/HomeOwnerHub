// The Cmd-K palette indexes the guide and template library from lib/library.ts,
// not a hand-kept list.

import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { LIBRARY_ITEMS, PALETTE_ITEMS, searchPalette } from './command-palette'
import { ALL_GUIDES, CHECKLISTS, pathOf } from '../../lib/georgia'
import { libraryEntries } from '../../lib/library'

describe('command palette library index', () => {
  it('includes a known guide slug', () => {
    const hrefs = PALETTE_ITEMS.map((i) => i.href)
    expect(hrefs).toContain('/guides/california-hoa-internal-dispute-resolution')
    expect(hrefs).toContain('/templates/florida-hoa-fine-hearing-notice')
  })

  it('has every guide and template in the registry', () => {
    const hrefs = new Set(LIBRARY_ITEMS.map((i) => i.href))
    for (const g of ALL_GUIDES) expect(hrefs.has(pathOf(g)), g.slug).toBe(true)
    for (const c of Object.values(CHECKLISTS)) expect(hrefs.has(pathOf(c)), c.slug).toBe(true)
    expect(LIBRARY_ITEMS).toHaveLength(libraryEntries().length)
  })

  it('finds a guide by a word in its description, and labels it Guide or Template', () => {
    const hit = searchPalette(PALETTE_ITEMS, 'meet and confer')
    expect(hit.some((i) => i.href === '/guides/california-hoa-internal-dispute-resolution' && i.category === 'Guide')).toBe(true)
    const tpl = searchPalette(PALETTE_ITEMS, 'payment plan agreement')
    expect(tpl.some((i) => i.category === 'Template')).toBe(true)
  })
})
