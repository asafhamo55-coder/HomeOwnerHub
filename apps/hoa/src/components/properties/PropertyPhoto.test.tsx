import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyPhoto, PropertyPhotoView, photoSrc } from './PropertyPhoto'

;(globalThis as { React?: typeof React }).React = React

const ID = '11111111-1111-4111-8111-111111111111'
const ADDRESS = '1234 peachtree street northeast, atlanta, georgia 30309'

const view = (state: 'loading' | 'loaded' | 'failed', extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(PropertyPhotoView, { address: ADDRESS, enabled: true, state, ...extra }),
  )

describe('PropertyPhoto', () => {
  it('points at our own route', () => {
    expect(photoSrc(ID)).toBe('/api/properties/' + ID + '/photo')
  })

  it('shows the picture with the formatted address as alt text once loaded', () => {
    const html = view('loaded', { src: 'blob:abc' })
    expect(html).toContain('src="blob:abc"')
    expect(html).toContain('alt="1234 Peachtree St NE, Atlanta, GA 30309"')
    expect(html).not.toContain('googleapis')
  })

  it('keeps a fixed aspect ratio so the layout does not jump', () => {
    expect(view('loading')).toContain('aspect-[8/5]')
    expect(view('failed')).toContain('aspect-[8/5]')
  })

  it('shows the Google credit only with a picture, in readable text', () => {
    const html = view('loaded', { src: 'blob:abc' })
    expect(html).toMatch(/<figcaption[^>]*text-sm[^>]*>Image: Google Street View/)
    expect(view('loading')).not.toContain('Image: Google Street View')
    expect(view('failed')).not.toContain('Image: Google Street View')
  })

  it('shows a neutral placeholder and no img before and after a miss', () => {
    for (const s of ['loading', 'failed'] as const) {
      const html = view(s)
      expect(html).not.toContain('<img')
      expect(html).toContain('data-photo-placeholder')
    }
    expect(view('failed')).toContain('aria-label="No picture available for 1234 Peachtree St NE, Atlanta, GA 30309"')
    const loading = view('loading')
    expect(loading).toContain('aria-busy="true"')
    expect(loading).toContain('aria-label="1234 Peachtree St NE, Atlanta, GA 30309"')
    expect(loading).not.toContain('No picture available')
  })

  it('announces the reason once, in a polite live note, with the fix link for the board', () => {
    const html = view('failed', { reason: 'needs_location', canManage: true })
    expect(html).toContain('we need your community&#x27;s city and ZIP')
    expect(html).not.toMatch(/aria-label="[^"]*city and ZIP/)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('href="/settings/association#community-location"')
    expect(html).toContain('min-h-11')
  })

  it('shows a resident the reason with no settings link', () => {
    const html = view('failed', { reason: 'needs_location', canManage: false })
    expect(html).toContain('the board needs to add')
    expect(html).not.toContain('/settings/association')
  })

  it('makes no img and says photos are off when there is no key', () => {
    const off = renderToStaticMarkup(React.createElement(PropertyPhoto, { propertyId: ID, address: ADDRESS, enabled: false }))
    expect(off).not.toContain('<img')
    expect(off).toContain('Photos are turned off.')
  })

  it('says the address is missing, from the server, with no request', () => {
    const html = renderToStaticMarkup(React.createElement(PropertyPhoto, { propertyId: ID, address: ADDRESS, enabled: true, knownReason: 'no_address' }))
    expect(html).toContain('no street address yet')
  })
})
