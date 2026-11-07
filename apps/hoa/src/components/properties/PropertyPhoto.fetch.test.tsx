// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PropertyPhoto } from './PropertyPhoto'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as { React?: typeof React }).React = React

const ID = '11111111-1111-4111-8111-111111111111'
let root: Root | null = null
let host: HTMLElement | null = null
const fetchMock = vi.fn()
const revoke = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  // No IntersectionObserver in jsdom: the component loads at once.
  vi.stubGlobal('IntersectionObserver', undefined)
  URL.createObjectURL = vi.fn(() => 'blob:photo-1')
  URL.revokeObjectURL = revoke
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  fetchMock.mockReset()
  revoke.mockReset()
  vi.unstubAllGlobals()
})

async function mount(props: Partial<React.ComponentProps<typeof PropertyPhoto>> = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(<PropertyPhoto propertyId={ID} address="1 Main St, Atlanta, GA 30309" enabled {...props} />)
  })
  await act(async () => {})
}

describe('PropertyPhoto fetch', () => {
  it('fetches once and shows the picture from a blob URL, revoked on unmount', async () => {
    fetchMock.mockResolvedValue(new Response(new Blob(['x'], { type: 'image/jpeg' }), { status: 200 }))
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/properties/${ID}/photo`)
    expect(host!.querySelector('img')?.getAttribute('src')).toBe('blob:photo-1')
    act(() => root!.unmount())
    root = null
    expect(revoke).toHaveBeenCalledWith('blob:photo-1')
  })

  it('reads the reason from the same response on a miss, and does not fetch again', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404, headers: { 'X-Photo-Reason': 'no_street_view' } }))
    await mount()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(host!.querySelector('img')).toBeNull()
    expect(host!.textContent).toContain('Google has no street picture for this address.')
  })

  it('shows the board link for needs_location, and none for a resident', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404, headers: { 'X-Photo-Reason': 'needs_location' } }))
    await mount({ canManage: true })
    expect(host!.querySelector('a')?.getAttribute('href')).toBe('/settings/association#community-location')
    act(() => root!.unmount())
    host!.remove()
    await mount({ canManage: false })
    expect(host!.querySelector('a')).toBeNull()
  })

  it('says Google could not be reached when the fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    await mount()
    expect(host!.textContent).toContain('Google could not be reached. Try again later.')
  })

  it('makes no request when a server-known reason is given', async () => {
    await mount({ knownReason: 'no_address' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
