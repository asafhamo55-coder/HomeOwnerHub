import { describe, expect, it } from 'vitest'
import { aimedImageUrl, bearingDegrees, distanceMeters, geocodeUrl, isPreciseGeocode, panoMetadataUrl, signStreetViewUrl, streetViewConfigured, streetViewLocation, streetViewUrls } from './street-view'

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

describe('bearingDegrees', () => {
  const o = { lat: 33, lng: -84 }
  it('points N, E, S and W', () => {
    expect(bearingDegrees(o, { lat: 33.001, lng: -84 })).toBeCloseTo(0, 5)
    expect(bearingDegrees(o, { lat: 33, lng: -83.999 })).toBeCloseTo(90, 1)
    expect(bearingDegrees(o, { lat: 32.999, lng: -84 })).toBeCloseTo(180, 5)
    expect(bearingDegrees(o, { lat: 33, lng: -84.001 })).toBeCloseTo(270, 1)
  })
  it('stays within 0-360 across the wrap', () => {
    const nw = bearingDegrees(o, { lat: 33.001, lng: -84.0001 })
    expect(nw).toBeGreaterThan(270)
    expect(nw).toBeLessThan(360)
    const ne = bearingDegrees(o, { lat: 33.001, lng: -83.9999 })
    expect(ne).toBeGreaterThan(0)
    expect(ne).toBeLessThan(90)
    expect(bearingDegrees({ lat: 0, lng: 179.9999 }, { lat: 0, lng: -179.9999 })).toBeCloseTo(90, 3)
    expect(bearingDegrees({ lat: 0, lng: -179.9999 }, { lat: 0, lng: 179.9999 })).toBeCloseTo(270, 3)
  })
  it('handles very close points and the same point', () => {
    const b = bearingDegrees(o, { lat: 33.00001, lng: -83.99999 })
    expect(b).toBeGreaterThan(0)
    expect(b).toBeLessThan(90)
    const same = bearingDegrees(o, o)
    expect(same).toBeGreaterThanOrEqual(0)
    expect(same).toBeLessThan(360)
  })
})

describe('isPreciseGeocode', () => {
  it('accepts only rooftop and interpolated results', () => {
    expect(isPreciseGeocode('ROOFTOP')).toBe(true)
    expect(isPreciseGeocode('RANGE_INTERPOLATED')).toBe(true)
    expect(isPreciseGeocode('APPROXIMATE')).toBe(false)
    expect(isPreciseGeocode('GEOMETRIC_CENTER')).toBe(false)
    expect(isPreciseGeocode(undefined)).toBe(false)
  })
})

describe('aimed URL builders', () => {
  const house = { lat: 33.1, lng: -84.2 }
  it('builds geocode, pano metadata and aimed image URLs, all signed with a secret', () => {
    const g = new URL(geocodeUrl('1 Main St', 'k'))
    expect(g.pathname).toBe('/maps/api/geocode/json')
    expect(g.searchParams.get('address')).toBe('1 Main St')
    const m = new URL(panoMetadataUrl(house, 'k'))
    expect(m.pathname).toBe('/maps/api/streetview/metadata')
    expect(Object.fromEntries(m.searchParams)).toMatchObject({ location: '33.1,-84.2', source: 'outdoor', radius: '50', key: 'k' })
    const i = new URL(aimedImageUrl('P1', 123.456, 'k'))
    expect(Object.fromEntries(i.searchParams)).toMatchObject({ pano: 'P1', heading: '123.5', pitch: '5', fov: '60', size: '640x400', key: 'k' })
    expect(i.searchParams.get('signature')).toBeNull()
    for (const u of [geocodeUrl('1 Main St', 'k', 'c2VjcmV0'), panoMetadataUrl(house, 'k', 'c2VjcmV0'), aimedImageUrl('P1', 1, 'k', 'c2VjcmV0')]) {
      expect(new URL(u).searchParams.get('signature')).toBeTruthy()
    }
  })
})

describe('distanceMeters', () => {
  it('measures short distances', () => {
    expect(distanceMeters({ lat: 33, lng: -84 }, { lat: 33.0001, lng: -84 })).toBeCloseTo(11.1, 0)
    expect(distanceMeters({ lat: 33, lng: -84 }, { lat: 33, lng: -84 })).toBe(0)
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111195, -2)
  })
})
