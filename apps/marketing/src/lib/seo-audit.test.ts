// Weekly SEO audit, enforced in CI (docs/decisions/2026-10-26-seo-primary-growth-channel.md).
//
// Checks, from the page registry and page sources (the root vitest config
// maps "@" to apps/hoa, so pages can't be imported):
//   - every sitemap URL has metadata, and its page actually calls pageMetadata
//   - rendered <title> (page title + the layout's suffix) is 30-60 characters
//   - meta description is 70-160 characters
//   - titles and descriptions are unique across the site
//   - exactly one <h1> per page, counted in the page and the components it imports
//   - every page's Open Graph block carries the share image

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_GUIDES, CHECKLISTS, GEORGIA_HUB_PATH, SITE_LINKS, pathOf } from './georgia'
import { PAGE_META, TITLE_SUFFIX } from './page-meta'
import { OG_IMAGE_PATH, SITEMAP_PATHS, pageMetadata } from './site'
import { STATE_CARDS, STATE_HUB_PATHS } from './state-law'

const marketingSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

interface Row {
  path: string
  title: string
  description: string
}

const TITLE_MIN = 30
const TITLE_MAX = 60
const DESC_MIN = 70
const DESC_MAX = 160

function metaFor(p: string): Row | undefined {
  const hand = PAGE_META[p]
  if (hand) return { path: p, title: hand.absoluteTitle ? hand.title : `${hand.title}${TITLE_SUFFIX}`, description: hand.description }
  const guide = ALL_GUIDES.find((g) => pathOf(g) === p)
  if (guide) return { path: p, title: `${guide.metaTitle}${TITLE_SUFFIX}`, description: guide.description }
  const list = Object.values(CHECKLISTS).find((c) => pathOf(c) === p)
  if (list) return { path: p, title: `${list.metaTitle}${TITLE_SUFFIX}`, description: list.description }
  return undefined
}

// /states/<slug> hubs are one dynamic page: app/states/[state]/page.tsx.
const pageFile = (p: string) =>
  path.join(marketingSrc, 'app', STATE_HUB_PATHS.includes(p) ? 'states/[state]' : p === '/' ? '' : p, 'page.tsx')
const read = (f: string) => readFileSync(f, 'utf8')
const rows = SITEMAP_PATHS.map((p) => metaFor(p)).filter((r): r is Row => !!r)

/** <h1 occurrences in the page plus the components it imports (one level). */
function h1Count(p: string): number {
  const src = read(pageFile(p))
  let n = (src.match(/<h1[\s>]/g) ?? []).length
  for (const m of src.matchAll(/import \{([^}]*)\} from '@\/components\/([^']+)'/g)) {
    const file = path.join(marketingSrc, 'components', `${m[2]}.tsx`)
    const used = m[1]!.split(',').map((x) => x.trim().split(' as ').pop()!).some((name) => name && new RegExp(`<${name}[\\s/>]`).test(src))
    if (used && existsSync(file)) n += (read(file).match(/<h1[\s>]/g) ?? []).length
  }
  return n
}

describe('SEO audit: metadata', () => {
  it('every sitemap URL has a title and description in the registry', () => {
    const missing = SITEMAP_PATHS.filter((p) => !metaFor(p))
    expect(missing).toEqual([])
  })

  it('every sitemap URL has a page file that calls pageMetadata', () => {
    for (const p of SITEMAP_PATHS) {
      const f = pageFile(p)
      expect(existsSync(f), `${p}: ${f}`).toBe(true)
      expect(read(f), `${p} sets no metadata`).toMatch(/pageMetadata\(/)
    }
  })

  it('hand-written pages take their metadata from PAGE_META, so the audit sees what ships', () => {
    for (const p of Object.keys(PAGE_META)) {
      // The state hubs read PAGE_META by their own path, built from the param.
      if (STATE_HUB_PATHS.includes(p)) expect(read(pageFile(p)), p).toContain('PAGE_META[path]')
      else expect(read(pageFile(p)), p).toContain(`PAGE_META['${p}']`)
    }
  })

  it('guide and checklist pages take their metadata from the guide data the audit reads', () => {
    for (const p of SITEMAP_PATHS) {
      if (PAGE_META[p]) continue
      expect(read(pageFile(p)), p).toMatch(/\.metaTitle/)
      expect(read(pageFile(p)), p).toMatch(/\.description/)
    }
  })

  it(`rendered titles are ${TITLE_MIN}-${TITLE_MAX} characters`, () => {
    const bad = rows.filter((r) => r.title.length < TITLE_MIN || r.title.length > TITLE_MAX).map((r) => `${r.path} (${r.title.length}): ${r.title}`)
    if (bad.length) throw new Error(bad.join(' | '))
  })

  it(`descriptions are ${DESC_MIN}-${DESC_MAX} characters`, () => {
    const bad = rows.filter((r) => r.description.length < DESC_MIN || r.description.length > DESC_MAX).map((r) => `${r.path} (${r.description.length})`)
    if (bad.length) throw new Error(bad.join(' | '))
  })

  it('titles are unique', () => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      expect(seen.get(r.title), `${r.path} repeats the title of ${seen.get(r.title)}`).toBeUndefined()
      seen.set(r.title, r.path)
    }
  })

  it('descriptions are unique', () => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      expect(seen.get(r.description), `${r.path} repeats the description of ${seen.get(r.description)}`).toBeUndefined()
      seen.set(r.description, r.path)
    }
  })
})

describe('SEO audit: structure', () => {
  it('every sitemap page renders exactly one <h1>', () => {
    const bad = SITEMAP_PATHS.map((p) => [p, h1Count(p)] as const).filter(([, n]) => n !== 1)
    expect(bad).toEqual([])
  })

  it('no orphan pages: every sitemap page is linked from the footer, the nav or the Georgia hub lists', () => {
    const navs = read(path.join(marketingSrc, 'components/site/footer.tsx')) + read(path.join(marketingSrc, 'components/site/nav.tsx'))
    const orphans = SITEMAP_PATHS.filter(
      (p) =>
        p !== '/' &&
        !navs.includes(`'${p}'`) &&
        !navs.includes(`"${p}"`) &&
        !SITE_LINKS.some((l) => l.path === p) &&
        // State hubs are linked from their card on /states (checked in marketing-truth.test.ts).
        !STATE_CARDS.some((c) => c.href === p),
    )
    expect(orphans).toEqual([])
  })

  it('the /georgia hub is one click from home (footer link)', () => {
    expect(read(path.join(marketingSrc, 'components/site/footer.tsx'))).toContain(`href: '${GEORGIA_HUB_PATH}'`)
  })

  it('pageMetadata carries the share image on Open Graph and Twitter, and a canonical path', () => {
    const m = pageMetadata({ title: 'Some page title', description: 'd', path: '/x' })
    expect(m.alternates?.canonical).toBe('/x')
    expect(JSON.stringify(m.openGraph)).toContain(OG_IMAGE_PATH)
    expect(JSON.stringify(m.twitter)).toContain(OG_IMAGE_PATH)
  })
})
