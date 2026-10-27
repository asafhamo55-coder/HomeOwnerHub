// Truth tests for the Georgia guides, checklists and readiness check:
// every statute quote is checked word for word against the fixture it names
// (the way the app's law.test.ts files do), every "what HomeownerHub does"
// line names a route and a release note that exist, and the pages stay
// plain-language and honest.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { QUOTES, type QuoteId } from '../georgia-quotes'
import { faqLd, breadcrumbLd, articleLd, howToLd, organizationLd, jsonLdString } from '../jsonld'
import { SITEMAP_PATHS } from '../site'
import {
  PLANNED,
  PROFESSIONALS_FAQS,
  PROFESSIONALS_META,
  PROFESSIONALS_PATH,
  SHARE_TODAY,
} from '../professionals'
import {
  ALL_GUIDES,
  CHECKLISTS,
  GENERAL_GUIDES,
  GENERAL_PATHS,
  GEORGIA_LINKS,
  SITE_LINKS,
  pathOf,
  GEORGIA_PATHS,
  GUIDE_LIST,
  READINESS_QUESTIONS,
  scoreReadiness,
} from './index'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')
const fixtureDir = path.join(repoRoot, 'scripts/fixtures/state-law')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const fixtures = new Map<string, string>()
const fixture = (name: string) => {
  if (!fixtures.has(name)) fixtures.set(name, squash(readFileSync(path.join(fixtureDir, name), 'utf8')))
  return fixtures.get(name)!
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length

function hoaRouteExists(route: string): boolean {
  const rel = route.replace(/^\//, '')
  const app = path.join(repoRoot, 'apps/hoa/src/app')
  return [path.join(app, '(dashboard)', rel, 'page.tsx'), path.join(app, rel, 'page.tsx')].some((c) => existsSync(c))
}

describe('statute quotes are verbatim', () => {
  const ids = Object.keys(QUOTES) as QuoteId[]
  it('there are quotes to check', () => expect(ids.length).toBeGreaterThan(60))

  it.each(ids)('%s is word for word in its fixture', (id) => {
    const q = QUOTES[id]
    expect(q.quote.length, id).toBeGreaterThan(10)
    expect(fixture(q.fixture), `${id}: not found in ${q.fixture}`).toContain(squash(q.quote))
  })

  it('a doctored quote is caught', () => {
    const q = QUOTES.regFee
    expect(fixture(q.fixture)).not.toContain(squash(q.quote.replace('$100.00', '$150.00')))
    expect(fixture(q.fixture)).toContain(squash(q.quote))
  })

  it('pins the numbers the guides rely on', () => {
    expect(QUOTES.regFee.quote).toMatch(/\$100\.00/)
    expect(QUOTES.regAmend.quote).toMatch(/within 30 days/)
    expect(QUOTES.feeNotice2.quote).toMatch(/30 days from the receipt/)
    expect(QUOTES.foreclose60.quote).toMatch(/^Not less than 60 days/)
    expect(QUOTES.threshold2027.quote).toMatch(/lesser of \$4,000\.00 or an amount equal to 12 months/)
    expect(QUOTES.threshold2027.quote).toMatch(/not less than \$2,000\.00/)
    expect(QUOTES.threshold2026.quote).toMatch(/at least \$2,000\.00/)
    expect(QUOTES.lapse2027.quote).toMatch(/six years/)
    expect(QUOTES.lapse2026.quote).toMatch(/four years/)
    expect(QUOTES.lateCharge.quote).toMatch(/greater of \$10\.00 or 10 percent/)
    expect(QUOTES.complaint180.quote).toMatch(/180 days/)
    expect(QUOTES.meetingNotice.quote).toMatch(/at least 21 days/)
    expect(QUOTES.actSection7.quote).toMatch(/July 1, 2026/)
    expect(QUOTES.actEffective.quote).toMatch(/January 1, 2027/)
  })

  it('all twelve owners’ rights are quoted, in order', () => {
    for (let n = 1; n <= 12; n++) expect(QUOTES[`right${n}` as QuoteId], `right${n}`).toBeTruthy()
  })

  it('every quote id used by a guide or checklist exists', () => {
    for (const g of ALL_GUIDES) for (const s of g.sections) for (const id of s.quotes ?? []) expect(QUOTES[id], `${g.slug}: ${id}`).toBeTruthy()
    for (const c of Object.values(CHECKLISTS)) for (const id of c.quotes) expect(QUOTES[id], `${c.slug}: ${id}`).toBeTruthy()
  })
})

describe('guides', () => {
  it('there are 6 to 8 guides', () => {
    expect(GUIDE_LIST.length).toBeGreaterThanOrEqual(6)
    expect(GUIDE_LIST.length).toBeLessThanOrEqual(8)
  })

  it('covers the owner-named topics', () => {
    const slugs = GUIDE_LIST.map((g) => g.slug)
    for (const s of [
      'registration-2027',
      'attorney-fee-notice',
      'foreclosure-threshold-2027',
      'owners-rights-2027',
      'late-fee-limits',
      'condo-vs-hoa-law',
      'complaint-process',
    ]) {
      expect(slugs).toContain(s)
    }
  })

  function guideWords(g: (typeof ALL_GUIDES)[number]): number {
    const text = [
      g.title,
      ...g.summary,
      ...g.sections.flatMap((s) => [s.heading, ...s.body, ...(s.list ?? []), ...(s.quotes ?? []).map((id) => QUOTES[id].quote)]),
      ...g.steps,
      ...g.faqs.flatMap((f) => [f.q, f.a]),
      ...g.hoaDoes.map((h) => h.text),
    ].join(' ')
    return words(text)
  }

  it.each(ALL_GUIDES.map((g) => [g.slug, g] as const))('%s is substantive (800 to 1,500 words)', (_s, g) => {
    const n = guideWords(g)
    expect(n, `${g.slug}: ${n} words`).toBeGreaterThanOrEqual(800)
    expect(n, `${g.slug}: ${n} words`).toBeLessThanOrEqual(1500)
  })

  it.each(ALL_GUIDES.map((g) => [g.slug, g] as const))('%s has the required parts', (_s, g) => {
    expect(g.metaTitle.length).toBeLessThanOrEqual(75)
    expect(g.description.length).toBeGreaterThan(80)
    expect(g.description.length).toBeLessThanOrEqual(200)
    expect(g.faqs.length).toBeGreaterThanOrEqual(4)
    expect(g.steps.length).toBeGreaterThanOrEqual(4)
    expect(g.related.length).toBeGreaterThanOrEqual(3)
    expect(g.sections.some((s) => (s.quotes ?? []).length > 0)).toBe(true)
    expect(g.dateModified >= g.datePublished).toBe(true)
  })

  it('titles and descriptions are unique', () => {
    const t = [...ALL_GUIDES.map((g) => g.metaTitle), ...Object.values(CHECKLISTS).map((c) => c.metaTitle), PROFESSIONALS_META.title]
    const d = [...ALL_GUIDES.map((g) => g.description), ...Object.values(CHECKLISTS).map((c) => c.description), PROFESSIONALS_META.description]
    expect(new Set(t).size).toBe(t.length)
    expect(new Set(d).size).toBe(d.length)
  })

  it('every related slug is a real page, and guides link to each other', () => {
    const known = new Set(SITE_LINKS.map((l) => l.slug))
    for (const g of [...ALL_GUIDES, ...Object.values(CHECKLISTS)]) for (const r of g.related) expect(known.has(r), `${g.slug} -> ${r}`).toBe(true)
    for (const g of ALL_GUIDES) expect(g.related.some((r) => ALL_GUIDES.some((x) => x.slug === r)), g.slug).toBe(true)
  })

  it('every "what HomeownerHub does" line names an app route and a release note that exist', () => {
    let count = 0
    for (const g of ALL_GUIDES) {
      for (const h of g.hoaDoes) {
        count++
        expect(hoaRouteExists(h.route), `${g.slug}: ${h.route}`).toBe(true)
        expect(existsSync(path.join(repoRoot, 'docs/releases', `${h.release}.md`)), `${g.slug}: ${h.release}`).toBe(true)
      }
      // A guide either says what the product does, or says it does not.
      expect(g.hoaDoes.length > 0 || Boolean(g.hoaDoesNot), g.slug).toBe(true)
    }
    expect(count).toBeGreaterThan(10)
  })

  it('the condo guide describes the shipped condominium support (BL-155), not "not covered"', () => {
    const g = GUIDE_LIST.find((x) => x.slug === 'condo-vs-hoa-law')!
    expect(g.hoaDoes.length).toBeGreaterThan(0)
    expect(JSON.stringify(g)).not.toMatch(/not covered/)
  })

  it('no invented figures: banned claims stay out', () => {
    const all = JSON.stringify([ALL_GUIDES, Object.values(CHECKLISTS), READINESS_QUESTIONS, SHARE_TODAY, PLANNED, PROFESSIONALS_FAQS])
    for (const re of [/\d+% of (HOAs|boards)/i, /\bcustomers?\b/i, /testimonial/i, /guarantee/i, /\blandlord/i, /Eviction Hub|PM Hub/, /in seconds/i, /saves? \d+/i]) {
      expect(all, String(re)).not.toMatch(re)
    }
  })

  it('never promises compliance or legal outcomes', () => {
    const all = JSON.stringify([ALL_GUIDES, Object.values(CHECKLISTS)])
    expect(all).not.toMatch(/makes (you|your (association|HOA)) compliant/i)
    expect(all).not.toMatch(/ensures? compliance/i)
  })
})

describe('checklists', () => {
  it('four printable checklists exist', () => {
    expect(Object.keys(CHECKLISTS).sort()).toEqual([
      'annual-meeting-notice-checklist',
      'attorney-fee-notice-checklist',
      'hoa-board-meeting-agenda',
      'violation-notice-checklist',
    ])
    for (const c of Object.values(CHECKLISTS)) expect(c.items.length).toBeGreaterThanOrEqual(8)
  })
})

describe('readiness check', () => {
  it('has ten questions, each pointing at a real guide', () => {
    expect(READINESS_QUESTIONS).toHaveLength(10)
    const slugs = new Set(GUIDE_LIST.map((g) => g.slug))
    for (const q of READINESS_QUESTIONS) expect(slugs.has(q.guide), q.id).toBe(true)
    expect(new Set(READINESS_QUESTIONS.map((q) => q.id)).size).toBe(10)
  })

  it('scores yes answers and lists the open items in order', () => {
    expect(scoreReadiness({}).yes).toBe(0)
    expect(scoreReadiness({}).open).toHaveLength(10)
    const all = Object.fromEntries(READINESS_QUESTIONS.map((q) => [q.id, true]))
    expect(scoreReadiness(all)).toMatchObject({ yes: 10, open: [] })
    const some = scoreReadiness({ statute: true, decision: true, late: false })
    expect(some.yes).toBe(2)
    expect(some.open[0]!.id).toBe('filing-pack')
  })

  it('the page stores and sends nothing', () => {
    const src = readFileSync(path.join(here, '../../components/georgia/readiness-check.tsx'), 'utf8')
    for (const re of [/localStorage|sessionStorage|document\.cookie|indexedDB/, /fetch\(|XMLHttpRequest|sendBeacon/, /use server/]) {
      expect(src, String(re)).not.toMatch(re)
    }
  })
})

describe('sitemap and structured data', () => {
  it('every Georgia page is in SITEMAP_PATHS', () => {
    for (const p of [...GEORGIA_PATHS, ...GENERAL_PATHS, PROFESSIONALS_PATH]) expect(SITEMAP_PATHS as readonly string[], p).toContain(p)
  })

  it('every Georgia page.tsx exists and sets its own canonical path', () => {
    for (const p of [...GEORGIA_PATHS, ...GENERAL_PATHS, PROFESSIONALS_PATH]) {
      const file = path.join(here, '../../app', p, 'page.tsx')
      expect(existsSync(file), p).toBe(true)
      expect(readFileSync(file, 'utf8')).toContain(`path: '${p}'`)
    }
  })

  it('FAQPage mirrors the visible FAQ, with the same questions and answers', () => {
    const g = GUIDE_LIST[0]!
    const ld = faqLd(g.faqs) as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity.map((e) => e.name)).toEqual(g.faqs.map((f) => f.q))
    expect(ld.mainEntity.map((e) => e.acceptedAnswer.text)).toEqual(g.faqs.map((f) => f.a))
  })

  it('Article, Breadcrumb and Organization data are well formed', () => {
    const g = GUIDE_LIST[0]!
    const a = articleLd({ headline: g.title, description: g.description, path: '/georgia/x', datePublished: g.datePublished, dateModified: g.dateModified }) as Record<string, string>
    expect(a['@type']).toBe('Article')
    expect(a.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(a.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const b = breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Georgia', path: '/georgia' }]) as { itemListElement: { position: number; item: string }[] }
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2])
    expect(b.itemListElement[1]!.item).toMatch(/^https?:\/\/.+\/georgia$/)
    const o = organizationLd() as Record<string, string>
    expect(o['@type']).toBe('Organization')
    expect(o.email).toMatch(/@homeownerledger\.com$/)
  })

  it('JSON-LD cannot close its script tag', () => {
    expect(jsonLdString({ x: '</script><b>' })).not.toContain('</script>')
  })
})

// BL-172 batch 2: violation notice checklist, board agenda template, two
// self-managed how-tos and the /professionals page.
describe('SEO batch 2 (BL-172)', () => {
  const norm = (s: string) => squash(s)

  it('the new statute quotes pin the numbers and limits the checklist relies on', () => {
    expect(QUOTES.fineAuth.quote).toMatch(/^If and to the extent provided in the instrument/)
    expect(QUOTES.fineAuth.quote).toMatch(/no such suspension shall deny any lot owner or occupants access to the lot/)
    expect(QUOTES.fineAuth.quote).toMatch(/right to vote in board elections based on failure to pay outstanding fines\.$/)
    expect(QUOTES.injunctNotice.quote).toMatch(/ten days’ written notice/)
    expect(QUOTES.boardQuorum.quote).toMatch(/one-half of the votes of the board of directors/)
    expect(QUOTES.reasonableRules.quote).toMatch(/reasonable rules or regulations/)
  })

  it('a doctored fine quote is caught', () => {
    const q = QUOTES.injunctNotice
    expect(fixture(q.fixture)).not.toContain(norm(q.quote.replace('ten days’', 'thirty days’')))
  })

  it('every violation checklist item is tagged statute or best practice, and statute items trace to a quote', () => {
    const c = CHECKLISTS['violation-notice-checklist']!
    expect(c.items.length).toBeGreaterThanOrEqual(12)
    for (const i of c.items) expect(['statute', 'practice'], i.text).toContain(i.basis)
    expect(c.items.filter((i) => i.basis === 'statute').length).toBeGreaterThanOrEqual(5)
    expect(c.items.filter((i) => i.basis === 'practice').length).toBeGreaterThanOrEqual(5)
    expect(c.quotes).toEqual(expect.arrayContaining(['fineAuth', 'reasonableRules', 'injunctNotice']))
    // The page says plainly which is which.
    expect(c.intro.join(' ')).toMatch(/Best practice/)
    expect(c.intro.join(' ')).toMatch(/not a legal requirement/)
    expect(c.intro.join(' ')).toMatch(/not legal advice/)
  })

  it('the violation checklist does not invent a fine amount or a notice period for fines', () => {
    const text = JSON.stringify(CHECKLISTS['violation-notice-checklist'])
    expect(text).not.toMatch(/\$\d/)
    expect(text).not.toMatch(/\b(14|15|21|30)[- ]day/)
  })

  it('the agenda template is state-neutral, printable and labelled as general information', () => {
    const c = CHECKLISTS['hoa-board-meeting-agenda']!
    expect(c.path).toBe('/templates/hoa-board-meeting-agenda')
    expect(c.items.length).toBeGreaterThanOrEqual(12)
    expect(c.intro.join(' ')).toMatch(/any state/)
    expect(c.intro.join(' ')).toMatch(/not legal advice/)
    // Georgia law appears only in the labelled quotes section.
    expect(JSON.stringify(c.items)).not.toMatch(/Georgia|O\.C\.G\.A\./)
    expect(c.quotesHeading).toMatch(/^Georgia notes/)
  })

  it('the two how-to guides are self-managed guides with the required parts', () => {
    const first = GUIDE_LIST.find((g) => g.slug === 'self-managed-hoa-georgia-first-90-days')!
    expect(first.title).toBe('How to run a self-managed HOA in Georgia: the first 90 days')
    expect(first.howTo).toBe(true)
    expect(first.steps.length).toBeGreaterThanOrEqual(4)
    const treasurer = GENERAL_GUIDES.find((g) => g.slug === 'hoa-treasurer-duties')!
    expect(treasurer.title).toBe('HOA treasurer duties: a plain-language checklist')
    expect(pathOf(treasurer)).toBe('/guides/hoa-treasurer-duties')
    expect(treasurer.hoaDoes.length).toBeGreaterThanOrEqual(4)
  })

  it('HowTo data lists the guide’s steps in order', () => {
    const g = GUIDE_LIST.find((x) => x.howTo)!
    const ld = howToLd({ name: g.title, description: g.description, steps: g.steps }) as { '@type': string; step: { position: number; text: string }[] }
    expect(ld['@type']).toBe('HowTo')
    expect(ld.step.map((s) => s.text)).toEqual(g.steps)
    expect(ld.step.map((s) => s.position)).toEqual(g.steps.map((_, i) => i + 1))
  })

  it('existing guides and checklists link to the new pages', () => {
    const into = (slug: string) => [...ALL_GUIDES, ...Object.values(CHECKLISTS)].filter((x) => x.related.includes(slug)).map((x) => x.slug)
    expect(into('self-managed-hoa-georgia-first-90-days')).toContain('registration-2027')
    expect(into('hoa-treasurer-duties')).toContain('late-fee-limits')
    expect(into('violation-notice-checklist')).toContain('complaint-process')
    expect(into('hoa-board-meeting-agenda')).toContain('annual-meeting-notice-checklist')
  })
})

describe('/professionals (BL-168 seats are not live)', () => {
  const page = readFileSync(path.join(here, '../../app/professionals/page.tsx'), 'utf8')

  it('says professional seats are coming soon and not live', () => {
    expect(page).toMatch(/Professional seats are coming soon/)
    expect(page).toMatch(/Not live yet\./)
    expect(page).toMatch(/Planned, not live/)
    expect(page).toMatch(/do not promise one/)
  })

  it('everything a board can share today names an app route and a release note that exist', () => {
    expect(SHARE_TODAY.length).toBeGreaterThanOrEqual(3)
    for (const s of SHARE_TODAY) {
      expect(hoaRouteExists(s.route), s.route).toBe(true)
      expect(existsSync(path.join(repoRoot, 'docs/releases', `${s.release}.md`)), s.release).toBe(true)
    }
  })

  it('does not say seats, roles or invitations are available now, and names no partners', () => {
    const all = JSON.stringify([SHARE_TODAY, PLANNED, PROFESSIONALS_FAQS, PROFESSIONALS_META]) + page
    for (const re of [/invite (your|an?) (CPA|attorney|accountant)/i, /\bpartners?\b(?! list| program)/i, /\bcustomers?\b/i, /testimonial/i, /guarantee/i, /\d+% /, /referral fee/i, /PM Hub|Eviction Hub|landlord/i]) {
      expect(all, String(re)).not.toMatch(re)
    }
    // Planned items are only ever shown under the "Planned, not live" label.
    expect(page.indexOf('Planned, not live')).toBeLessThan(page.indexOf('PLANNED.map'))
  })

  it('has a demo call to action and a contact address', () => {
    expect(page).toMatch(/event="demo_cta_click"/)
    expect(page).toMatch(/Book a demo/)
    expect(page).toMatch(/mailto:support@homeownerledger\.com/)
    expect(page).toMatch(/NotLegalAdvice/)
  })

  it('emits FAQPage and BreadcrumbList data that mirror the visible FAQ', () => {
    expect(page).toMatch(/faqLd\(PROFESSIONALS_FAQS\)/)
    expect(page).toMatch(/breadcrumbLd\(/)
    expect(PROFESSIONALS_FAQS.length).toBeGreaterThanOrEqual(4)
  })
})
