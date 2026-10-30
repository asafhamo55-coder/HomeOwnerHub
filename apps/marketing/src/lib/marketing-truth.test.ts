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
import { GEORGIA_FEATURES, GEORGIA_SCOPE_NOTE, OTHER_STATE_ROUTES, STATE_CARDS, STATE_COVERAGE } from './state-law'
import { SHIPPED_HOA_WORKFLOWS, WORKFLOWS, BAR_TARGETS } from './workflows'
import { DEFAULT_SITE_ORIGIN, SITEMAP_PATHS, SITE_ORIGIN, isIndexable, pageMetadata, siteOrigin } from './site'
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

// BL-157: Georgia is the launch state and its tools are real; every state
// item is backed by an apps/hoa route. (Positioning changed 2026-10-27:
// the site leads with the product, see the order tests below.)
describe('State law coverage (BL-157)', () => {
  it('every Georgia feature names an apps/hoa route that exists, and cites the law', () => {
    expect(GEORGIA_FEATURES.length).toBeGreaterThanOrEqual(5)
    for (const f of GEORGIA_FEATURES) {
      expect(hoaRouteExists(f.route), `${f.title}: ${f.route}`).toBe(true)
      expect(f.citation, f.title).toMatch(/O\.C\.G\.A\.|SB 406/)
    }
  })

  it('every Georgia feature that cites a release note cites one that exists', () => {
    for (const f of GEORGIA_FEATURES.filter((x) => x.release)) {
      expect(existsSync(path.join(repoRoot, 'docs/releases', `${f.release}.md`)), f.title).toBe(true)
    }
  })

  it('covers the owner-named Georgia items', () => {
    const titles = GEORGIA_FEATURES.map((f) => `${f.title} ${f.body} ${f.citation}`).join('\n')
    for (const re of [/SB 406 registration/, /44-3-232\(c\)/, /SB 406 § 7/, /quorum/i, /proxy/i, /Annual report/, /late fee/i]) {
      expect(titles).toMatch(re)
    }
  })

  it('other-state items have routes that exist', () => {
    for (const r of OTHER_STATE_ROUTES) expect(hoaRouteExists(r), r).toBe(true)
  })

  it('states are listed Georgia first, then FL, CA, TX', () => {
    expect(STATE_COVERAGE.map((s) => s.state)).toEqual(['GA', 'FL', 'CA', 'TX'])
  })

  it('keeps the not-legal-advice framing and the condo caveat', () => {
    expect(GEORGIA_SCOPE_NOTE).toMatch(/isn’t legal advice/)
    expect(GEORGIA_SCOPE_NOTE).toMatch(/condominium/)
  })

  // 2026-10-27 owner decision: the website leads with the product; state
  // law is ONE section, Georgia's SB 406 hub one card among four.
  it('the home page leads with the product and has one state-law section, in the agreed order', () => {
    const home = code('app/page.tsx')
    const order = ['<Hero', '<Pillars', '<ProductTour', '<HowItWorks', '<StateLawBuiltIn', '<TrustSecurity', '<PricingTeaser', '<HomeFaq', '<CtaCloser']
    const at = order.map((t) => home.indexOf(t))
    expect(at.every((i) => i >= 0), order.join(' ')).toBe(true)
    expect([...at].sort((x, y) => x - y)).toEqual(at)
    expect(home.match(/<StateLawBuiltIn/g)).toHaveLength(1)
  })

  it('the product tour tabs are the shipped sections of the HOA app, and /hoa and /pricing reuse them', () => {
    const tour = code('components/site/product-tour.tsx')
    const ids = [...tour.matchAll(/^\s{4}id: '([a-z-]+)',/gm)].map((m) => m[1])
    expect(ids).toEqual(['approvals', 'dues', 'violations', 'announcements', 'ask'])
    // Each tab maps to a real apps/hoa area.
    for (const route of ['/approvals', '/dues', '/violations', '/communications', '/ai/ask']) {
      expect(hoaRouteExists(route), route).toBe(true)
    }
    expect(code('app/hoa/page.tsx')).toMatch(/<ProductTour/)
    const pricing = code('app/pricing/page.tsx')
    expect(pricing).toMatch(/<ApprovalsScreen/)
    expect(pricing).toMatch(/\/#product-tour/)
    expect(code('app/page.tsx')).toMatch(/<ProductTour/)
  })

  it('/hoa shows state law as one section, after the product features', () => {
    const hoa = code('app/hoa/page.tsx')
    expect(hoa.match(/<StateLawBuiltIn/g)).toHaveLength(1)
    expect(hoa.indexOf('<StateLawBuiltIn')).toBeGreaterThan(hoa.indexOf('<HubFeatures'))
  })

  it('the hero headline is the product, not a state', () => {
    const hero = code('components/site/hero.tsx')
    expect(hero).toMatch(/AI workspace for self-managed HOA boards/)
    expect(hero).not.toMatch(/Georgia/)
    expect(code('app/hoa/page.tsx')).not.toMatch(/Georgia first|georgia-first/i)
  })

  it('the state-law cards list GA first, then FL, CA, TX, and match the coverage list', () => {
    expect(STATE_CARDS.map((c) => c.state)).toEqual(['GA', 'FL', 'CA', 'TX'])
    expect(STATE_CARDS[0]!.href).toBe('/georgia')
    for (const c of STATE_CARDS) {
      const cov = STATE_COVERAGE.find((x) => x.state === c.state)!
      expect(cov.name).toBe(c.name)
      expect(c.benefit.length, c.state).toBeLessThanOrEqual(170)
    }
    // Texas is the thin one: its card may only name what STATE_COVERAGE lists.
    expect(STATE_CARDS.find((c) => c.state === 'TX')!.benefit.toLowerCase()).toMatch(/resale certificate/)
  })

  it('nav and footer say "State laws" and link /states; the Georgia hub stays linked from the footer', () => {
    expect(read('components/site/nav.tsx')).toContain("label: 'State laws'")
    expect(read('components/site/nav.tsx')).not.toMatch(/label: 'Georgia'/)
    const footer = read('components/site/footer.tsx')
    expect(footer).toContain("href: '/states'")
    expect(footer).toContain("href: '/georgia'")
    expect(SITEMAP_PATHS).toContain('/states')
  })

  it('no customer is named on a rendered page (no approved case study)', () => {
    for (const rel of sourceFiles()) {
      if (rel === 'app/case-studies/madison-park/page.tsx') continue
      expect(code(rel), rel).not.toMatch(/Madison Park/)
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
        !/OTHER_HUBS_ENABLED|isOfferedHref/.test(read(rel)),
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

// BL-107: the legal pages describe an HOA-only service. Scope phrases from
// before BL-097 (landlords, evictions, tenants) must not come back. This
// guards scope wording only; it says nothing about the terms themselves.
describe('legal pages: HOA-only scope (BL-107)', () => {
  const LEGAL_PAGES = ['app/terms/page.tsx', 'app/privacy/page.tsx', 'app/dpa/page.tsx']
  const SCOPE_PHRASES: Array<[string, RegExp]> = [
    ['landlords', /landlord/i],
    ['evictions', /evict/i],
    ['tenants', /tenant/i],
    ['property managers', /property manag/i],
    ['rent collection', /\brent (roll|collection|payments?)\b/i],
    ['PM Hub', /PM Hub/],
    ['Eviction Hub', /Eviction Hub/],
  ]

  it.each(LEGAL_PAGES)('%s exists', (rel) => {
    expect(existsSync(path.join(marketingSrc, rel))).toBe(true)
  })

  it.each(SCOPE_PHRASES)('no legal page names %s', (_what, pattern) => {
    for (const rel of LEGAL_PAGES) expect(code(rel), rel).not.toMatch(pattern)
  })

  it('the terms describe HOA management software for associations and residents', () => {
    const terms = code('app/terms/page.tsx').replace(/\s+/g, ' ')
    expect(terms).toMatch(/HOA management software/)
    expect(terms).toMatch(/community associations and their residents/)
    expect(terms).toMatch(/Last updated: October 20, 2026/)
    expect(terms).toMatch(/What changed on October 20, 2026/)
  })

  it('the scan catches the pre-BL-107 wording', () => {
    const before = 'AI-assisted workflows for HOA boards, small landlords, and eviction-adjacent tasks. applicable HOA, landlord-tenant, and consumer protection laws'
    const hits = SCOPE_PHRASES.filter(([, re]) => re.test(before)).map(([w]) => w)
    expect(hits).toEqual(['landlords', 'evictions', 'tenants'])
  })
})

describe('metadata: one site origin, canonical URLs, OG on every page', () => {
  it('the site origin is www.homeownerledger.online unless a preview sets its own', () => {
    expect(DEFAULT_SITE_ORIGIN).toBe('https://www.homeownerledger.online')
    expect(siteOrigin(undefined)).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('not a url')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://www.homeownerledger.online/x')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://homeownerhub.vercel.app/x')).toBe('https://homeownerhub.vercel.app')
    // Never an app host (the app is www.homeownerledger.com; the .online
    // apex serves the app too), never a domain we don't own.
    expect(siteOrigin('https://www.homeownerledger.com')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://homeownerledger.com')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://homeownerledger.online')).toBe(DEFAULT_SITE_ORIGIN)
    expect(siteOrigin('https://ledger.ai')).toBe(DEFAULT_SITE_ORIGIN)
    expect(SITE_ORIGIN).toMatch(/^https?:\/\//)
  })

  it('the app origin is www.homeownerledger.com unless the env sets one', () => {
    // BL-157: the app stays on www.homeownerledger.com; sign-in and sign-up
    // links go there, never to this site.
    expect(DEFAULT_APP_ORIGIN).toBe('https://www.homeownerledger.com')
    expect(appOrigin(undefined)).toBe(DEFAULT_APP_ORIGIN)
    expect(appOrigin('https://www.homeownerledger.com/login')).toBe('https://www.homeownerledger.com')
  })

  it('only the production origin is indexable', () => {
    expect(isIndexable(DEFAULT_SITE_ORIGIN)).toBe(true)
    expect(isIndexable('https://homeownerhub.vercel.app')).toBe(false)
    expect(isIndexable('http://localhost:3030')).toBe(false)
  })

  it('robots.txt and the sitemap come from the site origin', () => {
    const robots = code('app/robots.ts')
    expect(robots).toMatch(/isIndexable\(\)/)
    expect(robots).toMatch(/sitemap: `\$\{SITE_ORIGIN\}\/sitemap\.xml`/)
    const sitemap = code('app/sitemap.ts')
    expect(sitemap).toMatch(/SITEMAP_PATHS/)
    expect(sitemap).toMatch(/\$\{SITE_ORIGIN\}/)
  })

  it('no hard-coded app or site host in rendered code: both come from one constant', () => {
    for (const rel of sourceFiles()) {
      if (rel === 'lib/site.ts' || rel === 'lib/app-origin.ts') continue
      const src = code(rel)
      expect(src, `${rel} types homeownerledger.online`).not.toMatch(/homeownerledger\.online/)
      // Email addresses on homeownerledger.com are fine; a URL is not.
      expect(src, `${rel} types an app URL`).not.toMatch(/https?:\/\/(www\.)?homeownerledger\.com/)
    }
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

  it('the sitemap lists every rendered page, and nothing else', () => {
    expect([...SITEMAP_PATHS].sort()).toEqual(rendered.map((p) => p.route).sort())
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

// BL-171: the Georgia hub, guides, checklists and readiness check. The
// quotes and the "what HomeownerHub does" lines are tested in
// lib/georgia/georgia-guides.test.ts; these scans cover what renders.
describe('Georgia growth pages (BL-171)', () => {
  const georgiaPages = marketingPages().filter((p) => p.route === '/georgia' || p.route.startsWith('/georgia/'))
  const renderedGeorgia = [
    ...georgiaPages.map((p) => p.rel),
    'components/georgia/guide-page.tsx',
    'components/georgia/checklist-page.tsx',
    'components/georgia/parts.tsx',
    'components/georgia/readiness-check.tsx',
    'app/professionals/page.tsx',
    'app/guides/hoa-treasurer-duties/page.tsx',
    'app/templates/hoa-board-meeting-agenda/page.tsx',
    'app/templates/hoa-violation-letter-georgia/page.tsx',
    'app/templates/georgia-hoa-collections-notice/page.tsx',
    'app/templates/hoa-board-meeting-minutes/page.tsx',
    'app/guides/switch-from-management-company-to-self-managed-hoa/page.tsx',
  ]
  const pageShells = [
    'components/georgia/guide-page.tsx',
    'components/georgia/checklist-page.tsx',
    'app/georgia/page.tsx',
    'app/georgia/readiness/page.tsx',
  ]

  it('the hub, twelve guides, three checklists and the readiness check all exist', () => {
    expect(georgiaPages.map((p) => p.route).sort()).toEqual([
      '/georgia',
      '/georgia/annual-meeting-notice-checklist',
      '/georgia/annual-meeting-quorum-proxies',
      '/georgia/attorney-fee-notice',
      '/georgia/attorney-fee-notice-checklist',
      '/georgia/complaint-process',
      '/georgia/condo-vs-hoa-law',
      '/georgia/fines-and-violation-hearings',
      '/georgia/foreclosure-threshold-2027',
      '/georgia/late-fee-limits',
      '/georgia/owners-rights-2027',
      '/georgia/readiness',
      '/georgia/records-inspection-requests',
      '/georgia/registration-2027',
      '/georgia/self-managed-hoa-georgia-first-90-days',
      '/georgia/special-assessments',
      '/georgia/violation-notice-checklist',
    ])
  })

  // BL-172 batch 2: pages outside /georgia that reuse the same shells.
  it('the treasurer guide, the agenda template and /professionals exist, each with its own canonical path', () => {
    const routes = marketingPages().map((p) => p.route)
    for (const r of ['/guides/hoa-treasurer-duties', '/templates/hoa-board-meeting-agenda', '/templates/hoa-violation-letter-georgia', '/templates/georgia-hoa-collections-notice', '/templates/hoa-board-meeting-minutes', '/guides/switch-from-management-company-to-self-managed-hoa', '/professionals']) {
      expect(routes, r).toContain(r)
      expect(read(`app${r}/page.tsx`), r).toContain(`path: '${r}'`)
    }
  })

  it('the shared shells end with the demo call to action and the not-legal-advice note on the batch 2 pages too', () => {
    // guide-page and checklist-page render the treasurer guide and the agenda template.
    for (const rel of ['components/georgia/guide-page.tsx', 'components/georgia/checklist-page.tsx']) {
      expect(read(rel), rel).toMatch(/<GeorgiaCta[^>]*general=\{general\}/)
      expect(read(rel), rel).toMatch(/NotLegalAdvice/)
    }
    const prof = read('app/professionals/page.tsx')
    expect(prof).toMatch(/event="demo_cta_click"/)
    expect(prof).toMatch(/NotLegalAdvice/)
    expect(prof).not.toMatch(/coming soon/i)
  })

  it('the how-to guide emits HowTo data; checklists emit Article, FAQPage and BreadcrumbList', () => {
    expect(read('components/georgia/guide-page.tsx')).toContain('howToLd(')
    const list = read('components/georgia/checklist-page.tsx')
    for (const fn of ['articleLd(', 'faqLd(', 'breadcrumbLd(']) expect(list).toContain(fn)
  })

  it('the sitemap carries each new page with its own lastModified date', () => {
    const src = read('app/sitemap.ts')
    expect(src).toMatch(/pathOf\(g\), g\.dateModified/)
    expect(src).toMatch(/PROFESSIONALS_PATH, PROFESSIONALS_UPDATED/)
    for (const p of ['/guides/hoa-treasurer-duties', '/templates/hoa-board-meeting-agenda', '/professionals', '/georgia/violation-notice-checklist', '/georgia/self-managed-hoa-georgia-first-90-days']) {
      expect(SITEMAP_PATHS, p).toContain(p)
    }
  })

  it('every Georgia page ends with the demo call to action and says it is not legal advice', () => {
    const shared = read('components/georgia/parts.tsx')
    expect(shared).toMatch(/Not legal advice/)
    expect(shared).toMatch(/event="demo_cta_click"/)
    for (const rel of pageShells) {
      expect(read(rel), rel).toMatch(/<GeorgiaCta/)
      expect(read(rel), rel).toMatch(/NotLegalAdvice/)
    }
  })

  it('guides emit Article, FAQPage and BreadcrumbList data; the layout emits Organization', () => {
    const guide = read('components/georgia/guide-page.tsx')
    for (const fn of ['articleLd(', 'faqLd(', 'breadcrumbLd(']) expect(guide).toContain(fn)
    expect(read('app/layout.tsx')).toMatch(/organizationLd\(\)/)
  })

  it('Georgia pages do not sell the PM or Eviction hubs, and quotes come from the tested quote bank', () => {
    for (const rel of renderedGeorgia) {
      expect(code(rel), rel).not.toMatch(/PM Hub|Eviction Hub|landlord/i)
    }
    expect(read('components/georgia/parts.tsx')).toMatch(/QUOTES\[id\]/)
  })

  it('the readiness check stores and sends nothing, and offers the 20-minute demo', () => {
    const src = read('components/georgia/readiness-check.tsx')
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie|fetch\(|sendBeacon|use server/)
    expect(src).toMatch(/Book a 20-minute demo/)
  })

  it('analytics events carry labels only, never form values', () => {
    expect(code('app/demo/demo-form.tsx')).toMatch(/trackEvent\('demo_submit_success', \{ page: pageLabel\(pathname\) \}\)/)
    expect(read('lib/analytics.ts')).toMatch(/\['demo_cta_click', 'demo_submit_success', 'pilot_cta_click'\]/)
  })

  it('the Search Console tag is read from NEXT_PUBLIC_GSC_VERIFICATION and omitted when unset', () => {
    const layout = code('app/layout.tsx')
    expect(layout).toMatch(/NEXT_PUBLIC_GSC_VERIFICATION/)
    expect(layout).toMatch(/GSC_VERIFICATION \? \{ verification/)
  })

  it('the Covenant Brain demo is lazy-loaded, keeping framer-motion out of the home page first load', () => {
    expect(read('components/site/see-it-work.tsx')).not.toMatch(/covenant-brain-demo['"]/)
    expect(read('components/site/lazy-covenant-brain.tsx')).toMatch(/dynamic\(/)
  })

  it('"Book a demo" is in the header and every main page closer', () => {
    expect(read('components/site/nav.tsx')).toMatch(/position="header"[\s\S]*Book a demo/)
    for (const rel of ['components/site/cta-closer.tsx', 'app/pricing/page.tsx', 'app/compare/page.tsx', 'app/about/page.tsx']) {
      expect(read(rel), rel).toMatch(/Book a demo/)
    }
    expect(read('app/hoa/page.tsx')).toMatch(/'Book a demo'/)
  })
})
