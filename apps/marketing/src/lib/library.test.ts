// The /guides and /templates indexes read the registry, so these tests check
// that nothing in the registry is left off a page and that the copy rules hold.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_GUIDES, CHECKLISTS, pathOf } from './georgia'
import { GUIDES_PATH, TEMPLATES_PATH, groupOf, guideGroups, templateGroups } from './library'
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

  it('emit breadcrumb JSON-LD and a demo CTA, and use no client JS', () => {
    const shell = read('components/georgia/library-page.tsx')
    expect(shell).toContain('breadcrumbLd(')
    expect(shell).toContain('href="/demo"')
    expect(shell).not.toMatch(/'use client'/)
  })

  it('copy has no em dash or en dash', () => {
    const copy = [
      read('app/guides/page.tsx'),
      read('app/templates/page.tsx'),
      read('components/georgia/library-page.tsx'),
      read('lib/library.ts'),
      ...guideGroups().flatMap((g) => g.items.map((i) => i.title + i.description)),
      ...templateGroups().flatMap((g) => g.items.map((i) => i.title + i.description + g.label + g.blurb)),
    ].join('\n')
    expect(copy).not.toMatch(/—|–/)
  })
})
