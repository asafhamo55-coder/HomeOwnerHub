import { describe, it, expect, vi } from 'vitest'
import { renderEmailDocument, resetLogoWarning } from './shell'

const ORIGINAL_BASE = process.env.EMAIL_ASSET_BASE_URL

const BASE = {
  bodyHtml: '<p style="margin:0;color:#1a1d21;">Hello</p>',
  footerHtml: 'Sent by Madison Park',
}

describe('renderEmailDocument', () => {
  it('constrains width with a table attribute, not a CSS max-width', () => {
    const html = renderEmailDocument(BASE)
    expect(html).toContain('<table role="presentation" width="600"')
    // Bug A: the Word engine ignores both of these.
    expect(html).not.toContain('max-width')
    expect(html).not.toContain('margin:0 auto')
  })

  it('fluid: shrinks on phones, still fixed at 600 for Outlook via an MSO-only ghost table', () => {
    const html = renderEmailDocument({ ...BASE, fluid: true })
    expect(html).toContain('width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;max-width:600px;')
    expect(html).toContain('<!--[if mso]><table role="presentation" width="600"')
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->')
    expect(html).not.toContain('style="width:600px;')
  })

  it('emits a full document with a doctype so Outlook does not quirks-mode it', () => {
    expect(renderEmailDocument(BASE)).toMatch(/^<!DOCTYPE html/i)
  })

  it('renders an optional accent band with both bgcolor and inline colours', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'Madison Park', color: '#2F8F5B' } })
    expect(html).toContain('bgcolor="#2F8F5B"')
    expect(html).toContain('background-color:#2F8F5B')
    // Every background carries an explicit foreground — partial inversion rule.
    expect(html).toMatch(/background-color:#2F8F5B[^"]*color:#ffffff/)
    expect(html).toContain('Madison Park')
  })

  it('omits the band entirely when not supplied', () => {
    // Band text deliberately distinct from BASE.footerHtml ("Sent by Madison
    // Park") — reusing "Madison Park" here would make the no-band case
    // contain that string anyway (via the footer) regardless of band logic.
    const withBand = renderEmailDocument({ ...BASE, band: { text: 'Riverside Commons', color: '#2F8F5B' } })
    const without = renderEmailDocument(BASE)
    expect(withBand).toContain('bgcolor="#2F8F5B"')
    expect(without).not.toContain('bgcolor="#2F8F5B"')
    expect(without).not.toContain('Riverside Commons')
  })

  it('keeps bgcolor attributes on the structural cells — Outlook needs them', () => {
    // The Word engine honours the ATTRIBUTE, not the inline style. Asserting
    // "no bgcolor anywhere" to prove the band is absent would forbid these
    // and silently degrade every email in Outlook.
    const html = renderEmailDocument(BASE)
    expect(html).toContain('bgcolor="#F6F2FB"') // page background (lilac)
    expect(html).toContain('bgcolor="#FFFFFF"') // card
    expect(html).toContain('bgcolor="#FBF8FD"') // footer
  })

  it('escapes band text', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'A & B <hi>', color: '#2F8F5B' } })
    expect(html).toContain('A &amp; B &lt;hi&gt;')
    expect(html).not.toContain('<hi>')
  })

  it('includes hidden preheader text when supplied', () => {
    const html = renderEmailDocument({ ...BASE, previewText: 'Four waste stations' })
    expect(html).toContain('Four waste stations')
    expect(html).toContain('display:none')
  })

  it('never emits a CSS gradient', () => {
    const html = renderEmailDocument({ ...BASE, band: { text: 'X', color: '#2F8F5B' } })
    expect(html).not.toContain('gradient')
  })

  it('escapes the title, and an empty or missing title gives an empty <title></title>', () => {
    const doc = (title?: string) => renderEmailDocument({ bodyHtml: 'x', footerHtml: 'y', title })
    expect(doc('Oak & <b>Vine</b> "hi"')).toContain('<title>Oak &amp; &lt;b&gt;Vine&lt;/b&gt; &quot;hi&quot;</title>')
    expect(doc('')).toContain('<title></title>')
    expect(doc()).toContain('<title></title>')
    expect(doc()).toContain('lang="en" xml:lang="en"')
  })
})

describe('the brand header', () => {
  const withBase = (base: string | undefined, fn: () => void) => {
    const prev = process.env.EMAIL_ASSET_BASE_URL
    if (base === undefined) delete process.env.EMAIL_ASSET_BASE_URL
    else process.env.EMAIL_ASSET_BASE_URL = base
    try {
      fn()
    } finally {
      if (prev === undefined) delete process.env.EMAIL_ASSET_BASE_URL
      else process.env.EMAIL_ASSET_BASE_URL = prev
    }
  }

  it('renders the logo as an absolute https img with alt, width and height, from EMAIL_ASSET_BASE_URL', () => {
    withBase('https://app.homeownerhub.test/', () => {
      const html = renderEmailDocument(BASE)
      expect(html).toContain(
        '<img src="https://app.homeownerhub.test/email/v2/homeownerhub-logo.png" alt="HomeownerHub" width="180" height="30"',
      )
      // White band, then the royal purple rule.
      expect(html).toMatch(/class="eh-logo" bgcolor="#FFFFFF" style="background-color:#FFFFFF;color:#211B2C/)
      expect(html).toMatch(/bgcolor="#6D28D9" height="4"/)
      // The logo comes before the body.
      expect(html.indexOf('alt="HomeownerHub"')).toBeLessThan(html.indexOf('Hello'))
    })
  })

  it('can be given its own URL (the browser-built welcome email), and null forces the text wordmark', () => {
    withBase(undefined, () => {
      expect(renderEmailDocument({ ...BASE, logoUrl: 'https://x.test/email/v2/homeownerhub-logo.png' })).toContain(
        'src="https://x.test/email/v2/homeownerhub-logo.png"',
      )
      const text = renderEmailDocument({ ...BASE, logoUrl: null })
      expect(text).not.toContain('<img')
      expect(text).toContain('>HomeownerHub</span>')
    })
  })

  it('falls back to the text wordmark, and says so, when EMAIL_ASSET_BASE_URL is missing', () => {
    withBase(undefined, () => {
      resetLogoWarning()
      const errors: string[] = []
      const spy = vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(String(m)))
      const html = renderEmailDocument(BASE)
      spy.mockRestore()
      expect(html).not.toContain('<img')
      expect(html).toContain('>HomeownerHub</span>')
      expect(errors.join(' ')).toMatch(/EMAIL_ASSET_BASE_URL/)
      // A second email in the same process does not log again.
      const again = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      renderEmailDocument(BASE)
      expect(again).not.toHaveBeenCalled()
      again.mockRestore()
    })
  })

  it('logo: false leaves it out (internal tooling that drew its own header)', () => {
    withBase('https://app.homeownerhub.test', () => {
      expect(renderEmailDocument({ ...BASE, logo: false })).not.toContain('alt="HomeownerHub"')
    })
  })

  it('keeps the original EMAIL_ASSET_BASE_URL untouched', () => {
    expect(process.env.EMAIL_ASSET_BASE_URL).toBe(ORIGINAL_BASE)
  })
})
