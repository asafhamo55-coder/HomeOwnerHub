// Weekly SEO audit, second half (2026-11-05): checks seo-audit.test.ts does
// not make. Internal links resolve to real pages (not redirects), the sitemap
// has no redirect sources, no guide is an orphan, structured data is
// well formed for every guide and checklist, images carry alt text, and the
// visible copy rules hold across the guide data.
//
// Reads page sources as text: the root vitest config maps "@" to apps/hoa.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ALL_GUIDES, CHECKLISTS, GEORGIA_HUB_PATH, GEORGIA_LINKS, GENERAL_LINKS, pathOf } from './georgia'
import { articleLd, breadcrumbLd, faqLd, organizationLd } from './jsonld'
import { OTHER_HUB_PATHS } from './hubs'
import { PAGE_META } from './page-meta'
import { SITEMAP_PATHS } from './site'
import { STATE_HUB_PATHS } from './state-law'

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = path.join(marketingRoot, 'src')
const read = (f: string) => readFileSync(f, 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const f = path.join(dir, name)
    if (statSync(f).isDirectory()) walk(f, out)
    else out.push(f)
  }
  return out
}

const sourceFiles = walk(src).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('.generated.ts'))

// Redirect sources from next.config.ts: /compare was removed (owner rule: the
// comparison lives only in the investor deck) and permanently redirects.
const configSrc = read(path.join(marketingRoot, 'next.config.ts'))
const REDIRECT_SOURCES = [...configSrc.matchAll(/source: '(\/[^':]*)/g)].map((m) => m[1]!).filter((s) => s !== '/')
// Routes that redirect() to another page instead of rendering their own.
const appDir = path.join(src, 'app')
const relRoute = (f: string) => '/' + path.relative(appDir, path.dirname(f)).split(path.sep).join('/')
const REDIRECT_PAGES = walk(appDir)
  .filter((f) => f.endsWith('page.tsx') && /\bredirect\(/.test(read(f)))
  .map(relRoute)

/** Route patterns for every app page and route handler: "/states/[state]" etc. */
const ROUTES = walk(appDir)
  .filter((f) => /\/(page\.tsx|route\.tsx?)$/.test(f))
  .map((f) => relRoute(f).replace(/^\/\.$/, '/'))
const routeRegexes = ROUTES.map((r) => new RegExp('^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$'))
const isRoute = (p: string) => p === '/' || routeRegexes.some((re) => re.test(p))

describe('SEO audit: sitemap hygiene', () => {
  it('lists no redirect source and no redirect-only page', () => {
    const bad = SITEMAP_PATHS.filter(
      (p) => REDIRECT_SOURCES.some((s) => p === s || p.startsWith(`${s}/`)) || REDIRECT_PAGES.includes(p),
    )
    expect(bad).toEqual([])
  })

  it('has no duplicate URLs and only absolute paths without a trailing slash', () => {
    expect(new Set(SITEMAP_PATHS).size).toBe(SITEMAP_PATHS.length)
    for (const p of SITEMAP_PATHS) {
      expect(p, p).toMatch(/^\/[a-z0-9\-/]*$/)
      if (p !== '/') expect(p.endsWith('/'), p).toBe(false)
    }
  })

  it('every sitemap path is a real route', () => {
    expect(SITEMAP_PATHS.filter((p) => !isRoute(p))).toEqual([])
  })

  it('/compare is gone: redirected, in no sitemap, linked from nowhere', () => {
    expect(REDIRECT_SOURCES).toContain('/compare')
    expect(existsSync(path.join(appDir, 'compare'))).toBe(false)
    const linkers = sourceFiles.filter((f) => /href[=:]\s*[{]?\s*['"`]\/compare/.test(read(f)))
    expect(linkers.map((f) => path.relative(src, f))).toEqual([])
  })

  it('robots.txt points at the sitemap and blocks nothing on production', () => {
    const r = read(path.join(appDir, 'robots.ts'))
    expect(r).toContain('/sitemap.xml')
    expect(r).toContain("allow: '/'")
    expect(r).toContain('isIndexable()')
  })
})

describe('SEO audit: internal links resolve', () => {
  // href="/x", href: '/x', href={'/x'}; query and fragment are ignored.
  const HREF = /href(?:=\{?|:)\s*['"`](\/[^'"`#?$\s{]*)/g
  it('every static internal link in the page code points at a real, non-redirecting route', () => {
    const bad: string[] = []
    for (const f of sourceFiles) {
      for (const m of read(f).matchAll(HREF)) {
        const p = m[1]!.replace(/(.)\/$/, '$1')
        if (p.startsWith('//')) continue
        if (/\.(svg|png|ico|xml|txt|pdf|csv|webmanifest)$/.test(p)) continue
        if (!isRoute(p)) bad.push(`${path.relative(src, f)}: ${p} (no such route)`)
        // /landlords and /eviction redirect while the hubs are off; links to them are filtered by isOfferedHref.
        else if (REDIRECT_PAGES.includes(p) && !(OTHER_HUB_PATHS as readonly string[]).includes(p)) bad.push(`${path.relative(src, f)}: ${p} (redirect-only page)`)
      }
    }
    expect(bad).toEqual([])
  })

  it('every related slug is a real guide, checklist or the readiness check', () => {
    const all = [...ALL_GUIDES, ...Object.values(CHECKLISTS)]
    const known = new Set(all.map((g) => g.slug))
    const bad: string[] = []
    for (const g of all) for (const s of g.related) if (!known.has(s) && s !== 'readiness') bad.push(`${g.slug} -> ${s}`)
    expect(bad).toEqual([])
  })

  it('no orphan guides: every guide and checklist is on a hub list, and most have an editorial inbound link', () => {
    const all = [...ALL_GUIDES, ...Object.values(CHECKLISTS)]
    const listed = new Set([...GEORGIA_LINKS, ...GENERAL_LINKS].map((l) => l.path))
    expect(all.filter((g) => !listed.has(pathOf(g))).map((g) => g.slug)).toEqual([])
    const inbound = new Set(all.flatMap((g) => g.related))
    const noInbound = all.filter((g) => !inbound.has(g.slug)).map((g) => g.slug)
    expect(noInbound.length / all.length, noInbound.join(', ')).toBeLessThan(0.1)
  })

  it('the Georgia hub renders the whole general guide list, which carries batches 27 and 28', () => {
    expect(read(path.join(appDir, 'georgia', 'page.tsx'))).toMatch(/GENERAL_LINKS\.map/)
    const hub = GENERAL_LINKS.map((l) => l.path)
    for (const page of [
      '/guides/georgia-hoa-reserve-fund-and-reserve-study',
      '/guides/georgia-hoa-annual-meeting-notice-and-reports-44-3-230',
      '/guides/georgia-hoa-annual-registration-secretary-of-state-14-3-1622',
      '/guides/georgia-hoa-records-the-association-must-keep-14-3-1601',
      '/guides/georgia-hoa-lien-priority-taxes-and-mortgages-44-3-232',
      '/guides/georgia-hoa-amendment-rental-restrictions-44-3-226',
    ]) {
      expect(hub, page).toContain(page)
      expect(SITEMAP_PATHS, page).toContain(page)
    }
  })
})

describe('SEO audit: images', () => {
  it('every <img> and next/image carries an alt attribute', () => {
    const bad: string[] = []
    for (const f of sourceFiles.filter((x) => x.endsWith('.tsx'))) {
      for (const m of read(f).matchAll(/<(img|Image)\b([^>]*?)\/?>/gs)) {
        if (!/\balt=|\{\.\.\.props\}/.test(m[2]!)) bad.push(`${path.relative(src, f)}: <${m[1]}>`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the share image route and the default share image exist', () => {
    expect(existsSync(path.join(appDir, 'og', 'route.tsx'))).toBe(true)
    expect(existsSync(path.join(appDir, 'opengraph-image.tsx'))).toBe(true)
  })
})

describe('SEO audit: structured data', () => {
  const pages = [...ALL_GUIDES, ...Object.values(CHECKLISTS)]
  const today = '2026-11-05'
  const ISO = /^\d{4}-\d{2}-\d{2}$/

  it('Article data: headline within 110 characters, ISO dates, modified on or after published, none in the future', () => {
    const bad: string[] = []
    for (const g of pages) {
      const ld = articleLd({ headline: g.title, description: g.description, path: pathOf(g), datePublished: g.datePublished, dateModified: g.dateModified })
      expect(ld['@type']).toBe('Article')
      if (String(ld.headline).length > 110) bad.push(`${g.slug}: headline ${String(ld.headline).length}`)
      if (!ISO.test(g.datePublished) || !ISO.test(g.dateModified)) bad.push(`${g.slug}: date format`)
      else if (g.dateModified < g.datePublished) bad.push(`${g.slug}: modified before published`)
      else if (g.dateModified > today) bad.push(`${g.slug}: future date`)
      if (!String(ld.mainEntityOfPage).startsWith('https://')) bad.push(`${g.slug}: mainEntityOfPage`)
    }
    expect(bad).toEqual([])
  })

  it('FAQPage data: non-empty, unique questions and answers', () => {
    const bad: string[] = []
    for (const g of pages) {
      const faqs = g.faqs ?? []
      if (!faqs.length) continue
      const ld = faqLd(faqs) as unknown as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      const names = ld.mainEntity.map((e) => e.name.trim())
      if (names.some((n) => !n)) bad.push(`${g.slug}: empty question`)
      if (ld.mainEntity.some((e) => !e.acceptedAnswer.text.trim())) bad.push(`${g.slug}: empty answer`)
      if (new Set(names).size !== names.length) bad.push(`${g.slug}: duplicate question`)
    }
    expect(bad).toEqual([])
  })

  it('BreadcrumbList data: positions run 1..n and every item is an absolute URL on the site origin', () => {
    const ld = breadcrumbLd([
      { name: 'Home', path: '/' },
      { name: 'Georgia', path: GEORGIA_HUB_PATH },
      { name: 'Guide', path: '/georgia/x' },
    ]) as unknown as { itemListElement: { position: number; item: string }[] }
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3])
    for (const i of ld.itemListElement) expect(i.item).toMatch(/^https:\/\/www\.homeownerledger\.online(\/|$)/)
  })

  it('Organization data has a stable @id, a site URL and a logo that exists', () => {
    const o = organizationLd() as { '@id': string; url: string; logo: string }
    expect(o['@id']).toBe(`${o.url}/#organization`)
    expect(existsSync(path.join(appDir, 'icon.svg'))).toBe(true)
    expect(o.logo).toBe(`${o.url}/icon.svg`)
  })

  it('no structured data claims ratings, reviews or review counts', () => {
    const files = sourceFiles.filter((f) => /ld\+json|jsonld/i.test(f) || /application\/ld\+json/.test(read(f)))
    for (const f of files) expect(read(f), path.relative(src, f)).not.toMatch(/aggregateRating|ratingValue|reviewCount/)
  })
})

describe('SEO audit: visible copy rules across the guide data', () => {
  const strings = (o: unknown): string[] => {
    const out: string[] = []
    const go = (v: unknown) => {
      if (typeof v === 'string') out.push(v)
      else if (Array.isArray(v)) v.forEach(go)
      else if (v && typeof v === 'object') Object.values(v).forEach(go)
    }
    go(o)
    return out
  }
  // Statute quotes are the law's own words and live in georgia-quotes.ts; guides cite them by id.
  const copy = strings([ALL_GUIDES, Object.values(CHECKLISTS), PAGE_META, GEORGIA_LINKS, GENERAL_LINKS])
  const head = (list: string[]) => list.map((s) => s.slice(0, 90))

  it('no em dash or en dash in guide, checklist, link-list or metadata copy', () => {
    expect(head(copy.filter((s) => /[—–]/.test(s)))).toEqual([])
  })

  it('no stock AI phrases', () => {
    const STOCK =
      /\b(delve|seamless(ly)?|game[- ]chang\w*|cutting[- ]edge|revolutioni[sz]e\w*|supercharge\w*|in today'?s (fast[- ]paced|digital)|navigate the (complex|ever)|it'?s important to note|to the next level|unlock(s|ing)? the (power|potential)|tapestry|testament to)\b/i
    expect(head(copy.filter((s) => STOCK.test(s)))).toEqual([])
  })

  it('no competitor named or compared (the matrix lives in the investor deck)', () => {
    const COMPETITOR = /\b(payhoa|vinteum|appfolio|buildium|frontsteps|townsq|cinc systems|condocontrol|alternatives? to)\b/i
    expect(head(copy.filter((s) => COMPETITOR.test(s)))).toEqual([])
    const code = sourceFiles
      .filter((f) => /\/(app|components)\//.test(f) && !/\/(landlords|eviction)\//.test(f))
      .filter((f) => COMPETITOR.test(read(f).replace(/^\s*(\/\/|\*|\/\*|\{\/\*).*$/gm, '')))
    expect(code.map((f) => path.relative(src, f))).toEqual([])
  })

  it('no fake reviews, testimonials or traction in the guide data', () => {
    const FAKE = /\b(trusted by|loved by|five[- ]star|5[- ]star|testimonials?|\d[\d,]*\+? (happy )?(customers|boards|associations|communities) (trust|use|rely))\b/i
    expect(head(copy.filter((s) => FAKE.test(s)))).toEqual([])
  })

  it('the terms say HomeownerHub gives no legal advice', () => {
    expect(read(path.join(appDir, 'terms', 'page.tsx')).replace(/\s+/g, ' ')).toMatch(/not your attorney; nothing in the product constitutes legal/)
  })

  it('state hubs and the legal pages are in the sitemap', () => {
    for (const p of [...STATE_HUB_PATHS, '/terms', '/privacy', '/dpa']) expect(SITEMAP_PATHS).toContain(p)
  })
})

describe('SEO audit: page code copy', () => {
  it('visible text in the roadmap and honesty-bars pages has no em or en dash', () => {
    const files = ['app/roadmap/roadmap-table.tsx', 'app/roadmap/page.tsx', 'app/honesty-bars/page.tsx', 'app/honesty-bars/bar-explorer.tsx']
    const bad: string[] = []
    for (const rel of files) {
      read(path.join(src, rel))
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)) return
          // '—' is the data value for "no bar", used as a key and never rendered.
          if (/^\s*'—'\s*:|'—'\s*\|/.test(line)) return
          if (/[—–]/.test(line.replace(/w\.bar === '—'/g, ''))) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
        })
    }
    expect(bad).toEqual([])
  })

  it('workflow names and descriptions shown on the site have no em or en dash', () => {
    const w = read(path.join(src, 'lib', 'workflows.ts'))
    const bad = w.split('\n').filter((l) => /^\s*\{ id:|^\s*description:/.test(l) && /[—–]/.test(l.replace(/bar: '—'/, '')))
    expect(bad.map((l) => l.trim().slice(0, 80))).toEqual([])
  })
})
