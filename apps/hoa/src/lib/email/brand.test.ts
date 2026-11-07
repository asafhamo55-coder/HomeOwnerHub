import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND, safeLogoUrlFromOrigin, wrapBrandedEmail } from './brand'
import { ensureBranded } from './ensure-branded'
import { isValidAccent, relativeLuminance } from './palette'
import { renderEmailDocument } from './shell'

const ratio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/**
 * Every text-on-background pair the emails use. `min` is WCAG AA: 4.5 for
 * text, 3 for large text and non-text. The comment column is what the
 * pair is in the markup.
 */
const PAIRS: ReadonlyArray<{ fg: string; bg: string; min: number; use: string }> = [
  { fg: BRAND.ink, bg: BRAND.card, min: 4.5, use: 'headings on the card' },
  { fg: BRAND.ink, bg: BRAND.tint, min: 4.5, use: 'callout text on the light blue wash' },
  { fg: BRAND.ink, bg: BRAND.page, min: 4.5, use: 'text on the page well' },
  { fg: BRAND.body, bg: BRAND.card, min: 4.5, use: 'body paragraphs' },
  { fg: BRAND.body, bg: BRAND.tint, min: 4.5, use: 'body on the wash' },
  { fg: BRAND.muted, bg: BRAND.card, min: 4.5, use: 'labels, secondary text' },
  { fg: BRAND.muted, bg: BRAND.panel, min: 4.5, use: 'footer (14px)' },
  { fg: BRAND.muted, bg: BRAND.page, min: 4.5, use: 'muted on the page well' },
  { fg: BRAND.primary, bg: BRAND.card, min: 4.5, use: 'links, "Hub" in the logo' },
  { fg: BRAND.primary, bg: BRAND.tint, min: 4.5, use: 'links on the wash' },
  { fg: '#FFFFFF', bg: BRAND.primary, min: 4.5, use: 'button text, band text (17px bold / 14px)' },
  { fg: '#FFFFFF', bg: BRAND.primaryHover, min: 4.5, use: 'pressed button' },
  { fg: BRAND.deep, bg: BRAND.card, min: 4.5, use: 'deep blue text on white' },
  { fg: BRAND.mintText, bg: BRAND.mintTint, min: 4.5, use: 'mint pill text' },
  { fg: BRAND.mintText, bg: BRAND.card, min: 4.5, use: 'mint-coloured text on white' },
  // Non-text: the bar fill against its track, and the rule against the card.
  { fg: BRAND.primary, bg: BRAND.track, min: 3, use: 'poll bar fill on track (non-text)' },
  { fg: BRAND.deep, bg: BRAND.card, min: 3, use: 'rule under the logo (non-text)' },
  { fg: '#FFFFFF', bg: BRAND.deep, min: 4.5, use: 'text on a deep blue band' },
  { fg: '#FFFFFF', bg: '#172554', min: 4.5, use: 'text on the dark-mode band' },
  { fg: BRAND.mintText, bg: BRAND.page, min: 4.5, use: 'green text on the page well' },
]

describe('email brand palette contrast', () => {
  it.each(PAIRS)('$fg on $bg ($use) is at least $min:1', ({ fg, bg, min }) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min)
  })

  it('matches the approved Option B palette', () => {
    expect(BRAND.primary).toBe('#2563EB')
    expect(BRAND.primaryHover).toBe('#1D4ED8')
    expect(BRAND.ink).toBe('#0F172A')
    expect(BRAND.deep).toBe('#1E40AF')
    expect(BRAND.mintText).toBe('#047857')
    expect(BRAND.line).toBe('#E2E8F0')
  })

  it('mint is decoration only: plain mint fails as text on white, the text mint passes', () => {
    expect(ratio(BRAND.mint, BRAND.card)).toBeLessThan(3)
    expect(ratio(BRAND.mintText, BRAND.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('primary blue survives dark-mode inversion (assertAccent window)', () => {
    expect(isValidAccent(BRAND.primary)).toBe(true)
  })
})

describe('the brand header in every renderer', () => {
  it('the shell renders the logo img with alt and an absolute https URL', () => {
    const prev = process.env.EMAIL_ASSET_BASE_URL
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.test'
    try {
      const html = renderEmailDocument({ bodyHtml: '<p>x</p>', footerHtml: 'y' })
      const img = html.match(/<img[^>]*>/)?.[0] ?? ''
      expect(img).toContain('src="https://app.homeownerhub.test/email/v4/homeownerhub-logo.png"')
      expect(img).toContain('alt="HomeownerHub"')
      expect(img).toContain('width="200"')
      expect(img).toContain('height="48"')
      // The badge carries its own colour: no white fill or border on the img.
      const style = img.match(/style="([^"]*)"/)?.[1] ?? ''
      expect(style).not.toMatch(/background(-color)?:\s*(#fff|#ffffff|white)/i)
      expect(style).not.toMatch(/border:\s*[1-9]/)
      expect(img).not.toMatch(/bgcolor/i)
      // Clients honouring prefers-color-scheme: dark get the band in dark ink.
      expect(html).toMatch(/@media \(prefers-color-scheme: dark\)\{\.eh-logo\{background-color:#172554 !important/)
    } finally {
      if (prev === undefined) delete process.env.EMAIL_ASSET_BASE_URL
      else process.env.EMAIL_ASSET_BASE_URL = prev
    }
  })

  it('the jobs and workflows frame renders the same header and keeps the accessibility rules', () => {
    const prev = process.env.EMAIL_ASSET_BASE_URL
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.test'
    try {
      const html = wrapBrandedEmail({ bodyHtml: '<p>Hello</p>', footerHtml: 'Sent by HomeownerHub', title: 'T' })
      expect(html).toContain('src="https://app.homeownerhub.test/email/v4/homeownerhub-logo.png" alt="HomeownerHub" width="200" height="48"')
      expect(html).toContain('lang="en"')
      expect(html).toContain('<title>T</title>')
      expect(html).toContain('<meta name="color-scheme" content="light" />')
      expect(html).toMatch(/bgcolor="#1E40AF" height="4"/)
      expect(html).toMatch(/bgcolor="#F8FAFC" style="background-color:#F8FAFC;color:#526077;[^"]*font-size:14px/)
      expect(html).not.toMatch(/[–—]/)
      expect(html).not.toContain('gradient')
    } finally {
      if (prev === undefined) delete process.env.EMAIL_ASSET_BASE_URL
      else process.env.EMAIL_ASSET_BASE_URL = prev
    }
  })

  it('the jobs frame drops to the text wordmark when the asset base is unusable', () => {
    for (const base of [undefined, 'http://insecure.test', 'https://x.vercel.app', 'https://localhost']) {
      const env: Record<string, string | undefined> = { EMAIL_ASSET_BASE_URL: base }
      const prev = process.env.EMAIL_ASSET_BASE_URL
      if (base === undefined) delete process.env.EMAIL_ASSET_BASE_URL
      else process.env.EMAIL_ASSET_BASE_URL = base
      try {
        const html = wrapBrandedEmail({ bodyHtml: 'x' })
        expect(html, String(env.EMAIL_ASSET_BASE_URL)).not.toContain('<img')
        expect(html).toContain('>HomeownerHub</span>')
      } finally {
        if (prev === undefined) delete process.env.EMAIL_ASSET_BASE_URL
        else process.env.EMAIL_ASSET_BASE_URL = prev
      }
    }
  })
})

describe('ensureBranded (the send-time safety net)', () => {
  it('wraps a bare fragment in the brand frame', () => {
    const out = ensureBranded('<p>Your booking is confirmed.</p>', 'https://a.test/email/v4/homeownerhub-logo.png')
    expect(out).toContain('alt="HomeownerHub"')
    expect(out).toContain('Your booking is confirmed.')
    expect(out).toMatch(/^<!DOCTYPE/i)
  })

  it('leaves an already-branded document alone, so the logo never appears twice', () => {
    const once = renderEmailDocument({ bodyHtml: '<p>x</p>', footerHtml: 'y', logoUrl: 'https://a.test/l.png' })
    expect(ensureBranded(once)).toBe(once)
    const twice = ensureBranded(ensureBranded('<p>hi</p>', null), null)
    expect(twice.match(/class="eh-logo"/g)).toHaveLength(1)
  })

  it('sees a document behind a BOM or leading comments', () => {
    for (const doc of [
      '\uFEFF<!doctype html><html><body>hi</body></html>',
      '<!-- x -->\n<!--[if mso]>y<![endif]--><HTML><body>hi</body></HTML>',
    ]) {
      expect(ensureBranded(doc)).toBe(doc)
    }
  })

  it('welcome and preview drop to text, never a localhost or vercel host', () => {
    expect(safeLogoUrlFromOrigin('http://localhost:3000')).toBeNull()
    expect(safeLogoUrlFromOrigin('https://x-git-abc.vercel.app')).toBeNull()
    expect(safeLogoUrlFromOrigin('https://www.homeownerledger.com/')).toBe(
      'https://www.homeownerledger.com/email/v4/homeownerhub-logo.png',
    )
  })

  it('leaves a foreign full document alone rather than nesting documents', () => {
    const doc = '<!doctype html><html><body>hi</body></html>'
    expect(ensureBranded(doc)).toBe(doc)
  })
})

// ─── no old colours anywhere an email is built ──────────────────────────

const REPO = path.resolve(__dirname, '../../../../..')
const ROOTS = [
  'apps/hoa/src/lib',
  'apps/hoa/src/app',
  'packages/jobs/src',
  'packages/workflows/src',
  'scripts/release-notes/lib',
  'scripts/owner-actions/lib',
  'scripts/backlog-email/lib',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && !/test-helpers|test-util/.test(name)) out.push(full)
  }
  return out
}

/** A file builds email markup if it writes inline-styled tables or divs for mail. */
const BUILDS_EMAIL = /bgcolor=|role="presentation"|font-family:/

describe('no old brand colours in any email renderer', () => {
  const files = ROOTS.flatMap((r) => walk(path.join(REPO, r))).filter((f) => BUILDS_EMAIL.test(readFileSync(f, 'utf8')))

  it('finds the renderers (so the grep below is not vacuously green)', () => {
    const rel = files.map((f) => path.relative(REPO, f))
    for (const must of [
      'apps/hoa/src/lib/email/shell.ts',
      'apps/hoa/src/lib/resident-notify/receipt-render.ts',
      'apps/hoa/src/lib/polls/email/render.ts',
      'apps/hoa/src/lib/communications/welcome-email.ts',
      'packages/jobs/src/daily-digest.ts',
      'scripts/release-notes/lib/email.ts',
    ]) {
      expect(rel, must).toContain(must)
    }
  })

  it('has no old green, old violet or old slate (#1F6F5C, #4B27C9, #0A0F1A, #111827, #1E293B, #94A3B8)', () => {
    const offenders = files
      .filter((f) => /#1F6F5C|#4B27C9|#0A0F1A|#111827|#1E293B|#94A3B8/i.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(REPO, f))
    expect(offenders).toEqual([])
  })

  it('has no em dash in any rendered HTML of the shared shell frames', () => {
    const shell = renderEmailDocument({ bodyHtml: '<p>x</p>', footerHtml: 'y', logoUrl: null })
    expect(shell).not.toMatch(/[–—]/)
  })
})
