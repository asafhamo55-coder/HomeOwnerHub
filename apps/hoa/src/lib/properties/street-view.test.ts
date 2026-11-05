import { describe, expect, it } from 'vitest'
import { signStreetViewUrl, streetViewConfigured, streetViewLocation, streetViewUrls } from './street-view'

describe('streetViewConfigured', () => {
  it('is true only with a non-blank key', () => {
    expect(streetViewConfigured({})).toBe(false)
    expect(streetViewConfigured({ GOOGLE_MAPS_API_KEY: '   ' })).toBe(false)
    expect(streetViewConfigured({ GOOGLE_MAPS_API_KEY: 'abc' })).toBe(true)
  })
})

describe('streetViewUrls', () => {
  it('builds the free metadata call and the image call', () => {
    const u = streetViewUrls('1234 Peachtree St NE, Atlanta, GA 30309', 'k')
    const meta = new URL(u.metadata)
    expect(meta.origin + meta.pathname).toBe('https://maps.googleapis.com/maps/api/streetview/metadata')
    expect(meta.searchParams.get('location')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
    const img = new URL(u.image)
    expect(img.origin + img.pathname).toBe('https://maps.googleapis.com/maps/api/streetview')
    expect(Object.fromEntries(img.searchParams)).toMatchObject({
      size: '640x400',
      fov: '80',
      return_error_code: 'true',
      source: 'outdoor',
      key: 'k',
    })
    expect(u.image).not.toContain('signature=')
  })

  it('signs both URLs when a secret is given, deterministically', () => {
    const a = streetViewUrls('1 Main St', 'k', 'c2VjcmV0')
    const b = streetViewUrls('1 Main St', 'k', 'c2VjcmV0')
    expect(new URL(a.image).searchParams.get('signature')).toBeTruthy()
    expect(a).toEqual(b)
    expect(signStreetViewUrl('https://maps.googleapis.com/maps/api/streetview?x=1', 'c2VjcmV0')).toMatch(/&signature=[A-Za-z0-9_=-]+$/)
  })
})

describe('streetViewLocation', () => {
  it('uses the standard one-line address without the unit', () => {
    expect(streetViewLocation('1234 peachtree street northeast apt 5, atlanta, georgia 30309')).toBe('1234 Peachtree St NE, Atlanta, GA 30309')
  })
  it('lets a street-only address borrow the community place', () => {
    expect(streetViewLocation('105 Springwood Parkway', { city: 'Atlanta', state: 'GA', postal_code: '30067' })).toBe(
      '105 Springwood Pkwy, Atlanta, GA 30067',
    )
  })
  it('does not override an address that has its own state', () => {
    expect(streetViewLocation('9 Oak Ave, Macon, GA 31201', { city: 'Atlanta', state: 'GA', postal_code: '30067' })).toBe('9 Oak Ave, Macon, GA 31201')
  })
  it('is null with no street', () => {
    expect(streetViewLocation('')).toBeNull()
    expect(streetViewLocation(null)).toBeNull()
  })
})
