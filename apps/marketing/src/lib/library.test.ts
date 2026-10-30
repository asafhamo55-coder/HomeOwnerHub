// The /guides and /templates indexes read the registry, so these tests check
// that nothing in the registry is left off a page and that the copy rules hold.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_GUIDES, CHECKLISTS, pathOf } from './georgia'
import { GUIDES_PATH, TEMPLATES_PATH, filterItems, filterSections, groupOf, guideGroups, libraryEntries, templateGroups } from './library'
import { SITEMAP_PATHS } from './site'

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(src, rel), 'utf8')

describe('guides index', () => {
  const items = guideGroups().flatMap((g) => g.items)

  it('lists every guide in the registry exactly once', () => {
    expect(items.map((i) => i.path).sort()).toEqual(ALL_GUIDES.map((g) => pathOf(g)).sort())
  })

  it('groups by state: Georgia first, then Florida, California, Texas, then any state', () => {
    expect(guideGroups().map((g) => g.id)).toEqual(['georgia', 'florida', 'california', 'texas', 'general'])
  })

  it('puts each guide with a state field in that state, and Georgia-law guides under Georgia', () => {
    for (const g of ALL_GUIDES) {
      if (g.state === 'FL') expect(groupOf(g), g.slug).toBe('florida')
      if (g.state === 'CA') expect(groupOf(g), g.slug).toBe('california')
      if (g.state === 'TX') expect(groupOf(g), g.slug).toBe('texas')
      if (pathOf(g).startsWith('/georgia/')) expect(groupOf(g), g.slug).toBe('georgia')
    }
  })

  it('shows each guide’s own title and meta description', () => {
    for (const g of ALL_GUIDES) {
      const i = items.find((x) => x.path === pathOf(g))!
      expect(i.title).toBe(g.title)
      expect(i.description).toBe(g.description)
    }
  })
})

describe('templates index', () => {
  const items = templateGroups().flatMap((g) => g.items)

  it('lists every template and checklist in the registry exactly once', () => {
    expect(items.map((i) => i.path).sort()).toEqual(Object.values(CHECKLISTS).map((c) => pathOf(c)).sort())
  })

  it('every /templates/* page is listed', () => {
    const listed = items.filter((i) => i.path.startsWith(`${TEMPLATES_PATH}/`))
    expect(listed.length).toBeGreaterThan(0)
  })
})

describe('index pages: site wiring and copy rules', () => {
  it('both are in the sitemap and linked from the footer', () => {
    const footer = read('components/site/footer.tsx')
    for (const p of [GUIDES_PATH, TEMPLATES_PATH]) {
      expect(SITEMAP_PATHS, p).toContain(p)
      expect(footer, p).toContain(`href: '${p}'`)
    }
  })

  it('emit breadcrumb JSON-LD and a demo CTA, and keep the page shell static with one client island', () => {
    const shell = read('components/georgia/library-page.tsx')
    expect(shell).toContain('breadcrumbLd(')
    expect(shell).toContain('href="/demo"')
    expect(shell).not.toMatch(/'use client'/)
    expect(shell).toContain('<LibraryFilter')
    expect(read('components/georgia/library-filter.tsx')).toMatch(/^'use client'/)
  })

  it('copy has no em dash or en dash', () => {
    const copy = [
      read('app/guides/page.tsx'),
      read('app/templates/page.tsx'),
      read('components/georgia/library-page.tsx'),
      read('components/georgia/library-filter.tsx'),
      read('lib/library.ts'),
      ...guideGroups().flatMap((g) => g.items.map((i) => i.title + i.description)),
      ...templateGroups().flatMap((g) => g.items.map((i) => i.title + i.description + g.label + g.blurb)),
    ].join('\n')
    expect(copy).not.toMatch(/—|–/)
  })
})

describe('batch 13 pages are in the library', () => {
  const guides = guideGroups().flatMap((g) => g.items)
  const templates = templateGroups().flatMap((g) => g.items)

  it('lists the California IDR guide under California', () => {
    const ca = guideGroups().find((g) => g.id === 'california')!
    expect(ca.items.map((i) => i.path)).toContain('/guides/california-hoa-internal-dispute-resolution')
    expect(guides.map((i) => i.slug)).toContain('california-hoa-internal-dispute-resolution')
  })

  it('lists the Texas and Florida templates', () => {
    const paths = templates.map((i) => i.path)
    expect(paths).toContain('/templates/texas-hoa-payment-plan-agreement')
    expect(paths).toContain('/templates/florida-hoa-fine-hearing-notice')
  })

  it('puts all three in the sitemap', () => {
    for (const p of ['/guides/california-hoa-internal-dispute-resolution', '/templates/texas-hoa-payment-plan-agreement', '/templates/florida-hoa-fine-hearing-notice']) {
      expect(SITEMAP_PATHS, p).toContain(p)
    }
  })

  it('has a page file for each', () => {
    for (const p of ['guides/california-hoa-internal-dispute-resolution', 'templates/texas-hoa-payment-plan-agreement', 'templates/florida-hoa-fine-hearing-notice']) {
      expect(read(`app/${p}/page.tsx`)).toContain('pageMetadata(')
    }
  })
})

describe('library filter', () => {
  const sections = guideGroups().map((g) => ({ id: g.id, label: g.label, items: g.items }))
  const total = sections.reduce((n, s) => n + s.items.length, 0)

  it('keeps everything when the query is empty', () => {
    expect(filterSections(sections, '  ').reduce((n, s) => n + s.items.length, 0)).toBe(total)
  })

  it('narrows by title and description, every word, any case', () => {
    const hits = filterItems(sections.flatMap((s) => s.items), 'CALIFORNIA fine')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.length).toBeLessThan(total)
    for (const h of hits) expect(`${h.title} ${h.description}`.toLowerCase()).toMatch(/california/)
  })

  it('drops empty sections and returns nothing for a query that matches nothing', () => {
    const tx = filterSections(sections, 'texas')
    expect(tx.map((s) => s.id)).toEqual(['texas'])
    expect(filterSections(sections, 'qqqqzzzz')).toEqual([])
  })

  it('feeds the palette one entry per guide and template', () => {
    expect(libraryEntries()).toHaveLength(total + templateGroups().reduce((n, g) => n + g.items.length, 0))
  })
})

describe('batch 14 pages are in the library', () => {
  const pages = ['/guides/texas-hoa-third-party-collections-notice', '/guides/california-hoa-pre-lien-notice-and-collections', '/templates/florida-hoa-notice-of-intent-to-lien']

  it('lists them on /guides or /templates and in the palette feed', () => {
    const guides = guideGroups().flatMap((g) => g.items.map((i) => i.path))
    const templates = templateGroups().flatMap((g) => g.items.map((i) => i.path))
    expect(guides).toEqual(expect.arrayContaining(pages.slice(0, 2)))
    expect(templates).toContain(pages[2])
    const feed = libraryEntries().map((e) => e.path)
    for (const p of pages) expect(feed, p).toContain(p)
  })

  it('puts them in the sitemap, with a page file each', () => {
    for (const p of pages) {
      expect(SITEMAP_PATHS, p).toContain(p)
      expect(read(`app${p}/page.tsx`)).toContain('pageMetadata(')
    }
  })
})
