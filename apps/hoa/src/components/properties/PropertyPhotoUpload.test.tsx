import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import { PropertyPhotoUpload } from './PropertyPhotoUpload'
import { PropertyPhotoView } from './PropertyPhoto'

;(globalThis as { React?: typeof React }).React = React

const ID = '11111111-1111-4111-8111-111111111111'

const upload = (props: { hasUpload: boolean; flagOn?: boolean }) =>
  renderToStaticMarkup(React.createElement(PropertyPhotoUpload, { propertyId: ID, ...props }))

describe('PropertyPhotoUpload', () => {
  it('renders nothing while M20 is off (the shipped default)', () => {
    expect(upload({ hasUpload: false })).toBe('')
    expect(upload({ hasUpload: true, flagOn: false })).toBe('')
  })

  it('shows a labelled control with 44px targets and plain words when on', () => {
    const html = upload({ hasUpload: false, flagOn: true })
    expect(html).toContain('Upload your own photo')
    expect(html).toContain('<label')
    expect(html).toContain('for="photo-upload-' + ID + '"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(html).not.toContain('Remove photo')
    expect(html).not.toContain('—')
  })

  it('offers Replace and Remove once a photo is uploaded', () => {
    const html = upload({ hasUpload: true, flagOn: true })
    expect(html).toContain('Replace photo')
    expect(html).toContain('Remove photo')
  })

  it('uses only real colour tokens', () => {
    const html = upload({ hasUpload: true, flagOn: true })
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|purple|violet/)
  })
})

describe('the no-photo sentence', () => {
  const view = (canUpload: boolean) =>
    renderToStaticMarkup(
      React.createElement(PropertyPhotoView, {
        propertyId: ID,
        address: '1 Main St',
        enabled: false,
        state: 'failed',
        reason: 'no_street_view',
        canUpload,
      }),
    )
  it('suggests an upload only when the reader can upload', () => {
    expect(view(true)).toContain('Or upload your own photo')
    expect(view(false)).not.toContain('upload your own photo')
  })
  it('shows an uploaded photo without the Street View credit', () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertyPhotoView, { propertyId: ID, address: '1 Main St', enabled: true, uploaded: true, state: 'loaded' }),
    )
    expect(html).not.toContain('Google Street View')
  })
})
