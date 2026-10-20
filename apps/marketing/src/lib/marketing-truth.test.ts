// Marketing truth round 4: guards for feature claims, brand, metadata and
// numbers across apps/marketing. Complements workflows.test.ts (AI
// workflow list) and hoa-pricing.test.ts (prices match checkout).
//
// Reads page sources as text: the root vitest config maps "@" to apps/hoa,
// so marketing pages can't be imported here.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OTHER_HUBS_ENABLED } from '@homeowner-portal/ui/hubs'
import { SHIPPED_FEATURES } from './features'
import { SHIPPED_HOA_WORKFLOWS, WORKFLOWS, BAR_TARGETS } from './workflows'
import { DEFAULT_SITE_ORIGIN, SITE_ORIGIN, pageMetadata, siteOrigin } from './site'
import { DEFAULT_APP_ORIGIN, appOrigin } from './app-origin'

const here = path.dirname(fileURLToPath(import.meta.url))
const marketingSrc = path.resolve(here, '..')
const appDir = path.join(marketingSrc, 'app')
const repoRoot = path.resolve(marketingSrc, '../../..')
const hoaApp = path.join(repoRoot, 'apps/hoa/src/app')
const read = (rel: string) => readFileSync(path.join(marketingSrc, rel), 'utf8')

/**
 * Source with comments removed, so the scans see what renders, not the
 * truth-rule notes explaining what was taken out. Rough but sufficient:
 * block comments (incl. JSX {/* *\/}), then // comments not inside a URL.
 */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Does this URL path exist in apps/hoa, as a page or an API route? */
function hoaRouteExists(route: string): boolean {
  const rel = route.replace(/^\//, '')
  const candidates = route.startsWith('/api/')
    ? [path.join(hoaApp, rel, 'route.ts')]
    : [path.join(hoaApp, '(dashboard)', rel, 'page.tsx'), path.join(hoaApp, rel, 'page.tsx')]
  return candidates.some((c) => existsSync(c))
}

/** Every non-test .ts/.tsx file under apps/marketing/src, relative to it. */
function sourceFiles(dir = marketingSrc): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path.relative(marketingSrc, full))
    }
  }
  return out
}

/** Marketing routes: every app/**\/page.tsx, as a URL path. */
function marketingPages(): { rel: string; route: string }[] {
  return sourceFiles(appDir)
    .filter((f) => f.endsWith('page.tsx'))
    .map((rel) => {
      // sourceFiles() paths are relative to src/, so they start with "app/".
      const dir = path.dirname(path.relative('app', rel))
      return { rel, route: dir === '.' ? '/' : `/${dir.split(path.sep).join('/')}` }
    })
}

// Pages and components that exist only to sell the PM / Eviction hubs.
// They redirect to /hoa (or render nothing) while OTHER_HUBS_ENABLED is off
// (BL-097), so the scans below skip them.
const OTHER_HUB_ONLY = new Set([
  'app/landlords/page.tsx',
  'app/eviction/page.tsx',
  'components/hub/visuals/pm-rent-card.tsx',
  'components/hub/visuals/eviction-case.tsx',
  'components/hub/widgets/rent-timeline-live.tsx',
  'components/hub/widgets/case-progress-live.tsx',
])

describe('round 4: shipped features are on the site, each with proof', () => {
  it('every "Also included" feature names an apps/hoa route that exists', () => {
    expect(SHIPPED_FEATURES.length).toBeGreaterThan(0)
    for (const f of SHIPPED_FEATURES) {
      expect(hoaRouteExists(f.route), `${f.text}: ${f.route} not found in apps/hoa`).toBe(true)
    }
  })

  it('every feature that cites a release note cites one that exists', () => {
    for (const f of SHIPPED_FEATURES.filter((x) => x.release)) {
      const file = path.join(repoRoot, 'docs/releases', `${f.release}.md`)
      expect(existsSync(file), `${f.text}: docs/releases/${f.release}.md missing`).toBe(true)
    }
  })

  it('the route check rejects a route that does not exist', () => {
    expect(hoaRouteExists('/properties/[id]/estoppel')).toBe(true)
    expect(hoaRouteExists('/properties/[id]/reserve-study')).toBe(false)
  })

  // What shipped in docs/releases/2026-10-19-* and 2026-10-20-*. Each must
  // be on /hoa (as a workflow card or an "Also included" line).
  const SHIPPED_SINCE_ROUND_3: Array<[string, RegExp]> = [
    ['Create from email', /Create from email/],
    ['saved replies', /saved replies/i],
    ['AI message composer', /Message drafter/],
    ['phone preview', /phone preview/i],
    ['street audiences', /single street/i],
    ['results + follow-up', /Results by home/],
    ['scheduled sends', /Scheduled sends/],
    ['built-in templates', /templates/i],
    ['resident assistant', /Resident assistant/],
    ['estoppel', /Estoppel certificates/],
    ['collections letters', /Collections letters/],
    ['budget notice', /owner budget notice/i],
  ]
  const hoaPageCopy = [
    read('app/hoa/page.tsx'),
    ...SHIPPED_FEATURES.map((f) => f.text),
    ...SHIPPED_HOA_WORKFLOWS.map((w) => `${w.name} ${w.description}`),
  ].join('\n')

  it.each(SHIPPED_SINCE_ROUND_3)('/hoa sells %s', (_name, pattern) => {
    expect(hoaPageCopy).toMatch(pattern)
  })

  it('/hoa renders the shared feature list, not a hand-typed copy', () => {
    expect(read('app/hoa/page.tsx')).toMatch(/SHIPPED_FEATURES/)
  })

  it('the message drafter and resident assistant are shipped workflows with real routes', () => {
    for (const name of ['Message drafter', 'Resident assistant']) {
      const w = SHIPPED_HOA_WORKFLOWS.find((x) => x.name === name)
      expect(w, name).toBeTruthy()
      expect(hoaRouteExists(w!.route!), `${name}: ${w!.route}`).toBe(true)
    }
  })

  it('/pricing lists the round-4 features', () => {
    const src = read('app/pricing/page.tsx')
    for (const s of ['Create from email', 'Resident assistant', 'Collections letters', 'phone preview']) {
      expect(src.toLowerCase(), s).toContain(s.toLowerCase())
    }
  })
})

describe('brand: HomeownerHub only', () => {
  const files = sourceFiles()

  it('no file uses a retired product name ("HOA Hub", "Ledger" as a name)', () => {
    for (const rel of files) {
      const src = read(rel)
      expect(src, `${rel} says "HOA Hub"`).not.toMatch(/HOA Hub/)
      // Capital-L "Ledger" as a word is the old product name; the
      // accounting term ("general ledger", "resident ledger") is lowercase
      // and the domain is homeownerledger.com.
      expect(src, `${rel} uses "Ledger" as a name`).not.toMatch(/(^|[^A-Za-z])Ledger([^A-Za-z]|$)/m)
    }
  })

  it('no ledger.ai address or link anywhere', () => {
    for (const rel of files) expect(read(rel), rel).not.toMatch(/ledger\.ai/i)
  })

  it('every email address on the site is on homeownerledger.com', () => {
    for (const rel of files) {
      // The demo inbox fallback is the owner's own address (server-only).
      if (rel === 'app/demo/actions.ts') continue
      for (const m of read(rel).matchAll(/[\w.+-]+@([\w-]+\.)+[a-z]{2,}/gi)) {
        expect(m[0], `${rel}: ${m[0]}`).toMatch(/@homeownerledger\.com$/)
      }
    }
  })

  it('the unused PM-promoting components stay deleted', () => {
    expect(existsSync(path.join(marketingSrc, 'components/site/products.tsx'))).toBe(false)
    expect(existsSync(path.join(marketingSrc, 'components/site/trust-strip.tsx'))).toBe(false)
  })

  it('BL-097: always-rendered pages do not promote the PM or Eviction hubs', () => {
    if (OTHER_HUBS_ENABLED) return
    // Files with no OTHER_HUBS_ENABLED switch: every line renders.
    const ungated = files.filter(
      (rel) =>
        !OTHER_HUB_ONLY.has(rel) &&
        rel.startsWith('app/') &&
        !/OTHER_HUBS_ENABLED|isOfferedHref/.test(read(rel)) &&
        // Legal text keeps its own wording until counsel revises it.
        !['app/terms/page.tsx', 'app/privacy/page.tsx'].includes(rel),
    )
    expect(ungated.length).toBeGreaterThan(5)
    for (const rel of ungated) {
      const src = code(rel)
      expect(src, `${rel} names PM Hub`).not.toMatch(/PM Hub/)
      expect(src, `${rel} names Eviction Hub`).not.toMatch(/Eviction Hub/)
      expect(src, `${rel} sells to landlords`).not.toMatch(/landlord/i)
    }
  })
})

describe('metadata: one site origin, canonical URLs, OG on every page', () => {
  it('the site origin is www.homeownerledger.com unless a preview sets its own', () => {
    expect(DEFAULT_SITE_ORIGIN).toBe('https://www.homeownerledger.com')
    expect(siteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('not a url')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://homeownerhub.vercel.app/x')).toBe('https://homeownerhub.vercel.app')
    // Never the app host, never a domain we don't own.
    expect(siteOrigin('https://app.homeownerledger.com')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://ledger.ai')).toBe(DEFAULT_SITE_ORIGIN)
    expect(SITE_ORIGIN).toMatch(/^https?:\/\//)
  })

  it('the app origin is app.homeownerledger.com unless the env sets one', () => {
    // Never www: marketing serves www, so a www app origin would loop
    // (docs/specs/2026-10-19-domain-split.md).
    expect(DEFAULT_APP_ORIGIN).toBe('https://app.homeownerledger.com')
    expect(appOrigin(undefined)).toBe(DEFAULT_APP_ORIGIN)
    expect(appOrigin('https://app.homeownerledger.com/login')).toBe('https://app.homeownerledger.com')
  })

  it('the layout sets metadataBase from the site origin, with no canonical of its own', () => {
    const layout = code('app/layout.tsx')
    expect(layout).toMatch(/metadataBase: new URL\(SITE_ORIGIN\)/)
    // A layout canonical is inherited by every page that lacks one.
    expect(layout).not.toMatch(/canonical/)
  })

  it('pageMetadata sets a canonical, OG and Twitter tags that agree', () => {
    const m = pageMetadata({ title: 'Pricing', description: 'd', path: '/pricing' })
    expect(m.alternates?.canonical).toBe('/pricing')
    expect(m.openGraph).toMatchObject({ url: '/pricing', title: 'Pricing · HomeownerHub', siteName: 'HomeownerHub' })
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'Pricing · HomeownerHub' })
    expect(() => pageMetadata({ title: 't', description: 'd', path: 'pricing' })).toThrow()
  })

  const pages = marketingPages().filter((p) => !OTHER_HUB_ONLY.has(p.rel))
  // Pages that only redirect have no metadata to set.
  const rendered = pages.filter((p) => !/^\s*redirect\(/m.test(read(p.rel)) || /export const metadata/.test(read(p.rel)))

  it.each(rendered.map((p) => [p.route, p.rel]))('%s has a canonical URL equal to its own path', (route, rel) => {
    const src = read(rel)
    expect(src, `${rel} must build metadata with pageMetadata()`).toMatch(/pageMetadata\(/)
    expect(src).toContain(`path: '${route}'`)
  })

  it('a default OG image exists for every route', () => {
    const og = read('app/opengraph-image.tsx')
    expect(og).toMatch(/export const size = \{ width: 1200, height: 630 \}/)
    expect(og).toMatch(/HomeownerHub|Homeowner/)
  })
})

describe('numbers: every figure on the site is sourced, or it is gone', () => {
  const files = sourceFiles().filter((rel) => !OTHER_HUB_ONLY.has(rel))

  // Each was on the site with nothing in the repo behind it.
  const BANNED: Array<[string, RegExp]> = [
    ['unsourced door count for Madison Park', /180 doors|180-home/],
    ['time-to-answer claim', /in seconds|in 3 seconds|by minute \d/i],
    ['time-to-value claim', /in an afternoon/i],
    ['"only platform" superlative', /only platform/i],
    ['uptime figure', /99\.\d+%/],
    ['hours-saved figure', /\d+\+?\s*(hours|hrs)\s+saved/i],
    ['customer-count figure', /\d[\d,]*\+?\s+(customers|boards|HOAs|communities)\s+(use|trust|run|rely)/i],
    ['accuracy percentage', /[<>]\s?\d{2}% accuracy/],
    ['passed roll-out date', /Q[1-4] 2026/],
    ['made-up doc timeline', /Month 6 — first integration partner/],
  ]

  it.each(BANNED)('no %s', (_what, pattern) => {
    for (const rel of files) expect(code(rel), rel).not.toMatch(pattern)
  })

  it('workflow descriptions and bar targets carry no unmeasured figures', () => {
    for (const w of WORKFLOWS) {
      expect(w.description, w.name).not.toMatch(/\d+\s*seconds|\d+%/)
    }
    for (const t of Object.values(BAR_TARGETS)) expect(t.threshold).not.toMatch(/\d+%/)
  })

  it('the hero stat counts the live workflow list instead of a typed number', () => {
    expect(read('components/site/hero.tsx')).toMatch(/SHIPPED_HOA_WORKFLOWS\.length/)
  })
})
