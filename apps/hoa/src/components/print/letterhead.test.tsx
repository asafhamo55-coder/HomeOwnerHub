import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Letterhead } from './Letterhead'

;(globalThis as { React?: typeof React }).React = React

describe('Letterhead', () => {
  it('prints the full-colour logo, 40px tall, with alt text and the association name', () => {
    const html = renderToStaticMarkup(<Letterhead name="Madison Park" />)
    expect(html).toContain('src="/brand/logo-full.svg"')
    expect(html).toContain('alt="HomeownerHub"')
    expect(html).toContain('height="40"')
    expect(html).toContain('h-10')
    expect(html).toContain('print-color-adjust:exact')
    expect(html).toContain('Madison Park')
  })
  it('omits the name when there is none', () => {
    expect(renderToStaticMarkup(<Letterhead />)).not.toContain('<span')
  })
})
