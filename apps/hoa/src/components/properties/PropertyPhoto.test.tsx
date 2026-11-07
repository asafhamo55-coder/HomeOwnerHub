import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyPhoto, PropertyPhotoView, photoSrc } from './PropertyPhoto'

;(globalThis as { React?: typeof React }).React = React

const ID = '11111111-1111-4111-8111-111111111111'
const ADDRESS = '1234 peachtree street northeast, atlanta, georgia 30309'

const view = (state: 'loading' | 'loaded' | 'failed', enabled = true) =>
  renderToStaticMarkup(
    React.createElement(PropertyPhotoView, { propertyId: ID, address: ADDRESS, enabled, state }),
  )

describe('PropertyPhoto', () => {
  it('points at our own route, lazy, with the formatted address as alt text', () => {
    const html = view('loading')
    expect(html).toContain(`src="${photoSrc(ID)}"`)
    expect(html).toContain('/api/properties/')
    expect(html).not.toContain('googleapis')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('alt="1234 Peachtree St NE, Atlanta, GA 30309"')
  })

  it('keeps a fixed aspect ratio so the layout does not jump', () => {
    expect(view('loading')).toContain('aspect-[8/5]')
    expect(view('failed')).toContain('aspect-[8/5]')
  })

  it('shows the Google credit only once a picture has loaded', () => {
    expect(view('loaded')).toContain('Image: Google Street View')
    expect(view('loading')).not.toContain('Image: Google Street View')
    expect(view('failed')).not.toContain('Image: Google Street View')
  })

  it('sets the credit in readable text for older users', () => {
    const html = view('loaded')
    expect(html).toMatch(/<figcaption[^>]*text-sm[^>]*>Image: Google Street View/)
    expect(html).not.toMatch(/<figcaption[^>]*text-xs/)
    expect(html).not.toMatch(/<figcaption[^>]*text-muted/)
  })

  it('falls back to a neutral house placeholder on error, with no img element', () => {
    const html = view('failed')
    expect(html).not.toContain('<img')
    expect(html).toContain('data-photo-placeholder')
    expect(html).toContain('No picture available for 1234 Peachtree St NE, Atlanta, GA 30309')
  })

  it('makes no request at all when the key is not set', () => {
    for (const state of ['loading', 'failed'] as const) {
      const html = view(state, false)
      expect(html).not.toContain('<img')
      expect(html).not.toContain('/api/properties/')
      expect(html).toContain('data-photo-placeholder')
    }
  })

  it('the stateful wrapper renders the lazy image first when enabled, and the placeholder when not', () => {
    const on = renderToStaticMarkup(React.createElement(PropertyPhoto, { propertyId: ID, address: ADDRESS, enabled: true }))
    expect(on).toContain('<img')
    const off = renderToStaticMarkup(React.createElement(PropertyPhoto, { propertyId: ID, address: ADDRESS, enabled: false }))
    expect(off).not.toContain('<img')
  })

  it('shows the reason and the fix link under the placeholder', () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyPhotoView, { propertyId: ID, address: ADDRESS, enabled: true, state: 'failed', reason: 'needs_location', canManage: true }),
    )
    expect(html).toContain('we need your community&#x27;s city and ZIP')
    expect(html).toContain('href="/settings/association#community-location"')
    expect(html).toContain('min-h-11')
  })

  it('says photos are turned off, with no request, when there is no key', () => {
    const html = renderToStaticMarkup(React.createElement(PropertyPhoto, { propertyId: ID, address: ADDRESS, enabled: false }))
    expect(html).toContain('Photos are turned off.')
    expect(html).not.toContain('<img')
  })
})
