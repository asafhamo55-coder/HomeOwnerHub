import { describe, it, expect } from 'vitest'
import { renderEmailDocument } from './shell'

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
    expect(renderEmailDocument(BASE)).not.toContain('bgcolor="#')
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
})
