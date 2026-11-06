/**
 * Google Street View pictures for a property (server side only).
 *
 * The key is `GOOGLE_MAPS_API_KEY`, read on the server and never sent to the
 * browser: the page asks our own route for the picture, and the route calls
 * Google. If `GOOGLE_MAPS_URL_SIGNING_SECRET` is set, requests are signed.
 *
 * Google's terms do not allow storing the pictures, so nothing here saves
 * one; the route only streams it back with a one-day private cache header.
 */

import { createHmac } from 'node:crypto'
import { formatAddress, formatAddressLine } from './address-format'

const BASE = 'https://maps.googleapis.com/maps/api/streetview'

const GEOCODE_BASE = 'https://maps.googleapis.com/maps/api/geocode/json'

export const STREET_VIEW_SIZE = '640x400'
/** Fallback field of view (address only, no heading). */
export const STREET_VIEW_FOV_DEFAULT = '80'
/** Aimed shots use a tighter view so the house fills the frame. */
export const STREET_VIEW_FOV_AIMED = 60
/** A slight upward tilt so the roofline is not cut off. */
export const STREET_VIEW_PITCH_AIMED = 5
/** How far from the house to look for the nearest panorama, in metres. */
export const STREET_VIEW_PANO_RADIUS_M = 50

/** True when a key is set. The page uses this to skip the request entirely. */
export function streetViewConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GOOGLE_MAPS_API_KEY?.trim())
}

/** Appends `signature=` per Google's URL signing: HMAC-SHA1 over path and query. */
export function signStreetViewUrl(url: string, secret: string): string {
  const u = new URL(url)
  const key = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  const signature = createHmac('sha1', key).update(`${u.pathname}${u.search}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_')
  return `${url}&signature=${signature}`
}

export interface StreetViewUrls {
  metadata: string
  image: string
}

export function streetViewUrls(location: string, key: string, signingSecret?: string | null): StreetViewUrls {
  const meta = new URLSearchParams({ location, key })
  const image = new URLSearchParams({
    size: STREET_VIEW_SIZE,
    location,
    fov: STREET_VIEW_FOV_DEFAULT,
    return_error_code: 'true',
    source: 'outdoor',
    key,
  })
  const sign = (u: string) => (signingSecret ? signStreetViewUrl(u, signingSecret) : u)
  return {
    metadata: sign(`${BASE}/metadata?${meta.toString()}`),
    image: sign(`${BASE}?${image.toString()}`),
  }
}

/** The community's own city, state and ZIP, to complete a street-only address. */
export interface LocationFallback {
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

/**
 * The text Google geocodes: the standard one-line address (no unit, a unit
 * does not change the building). A street-only address borrows the city,
 * state and ZIP the unit record has, so "105 Springwood Pkwy" is not looked
 * up across the whole country. Null when there is no street at all.
 */
export function streetViewLocation(address: string | null | undefined, fallback?: LocationFallback | null): string | null {
  const parts = formatAddress(address)
  if (!parts.line1) return null
  // Only a street with no state of its own borrows the community's place.
  const borrow = !parts.state && fallback
  const city = parts.city || (borrow ? fallback.city?.trim() : '') || ''
  const state = parts.state || (borrow ? fallback.state?.trim() : '') || ''
  const zip = parts.zip || (borrow ? fallback.postal_code?.trim() : '') || ''
  return formatAddressLine([parts.line1, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '))
}

export interface LatLng {
  lat: number
  lng: number
}

/** A panorama closer than this to the house is likely inside the lot; farther than this is a back alley or cross street. */
export const STREET_VIEW_PANO_MIN_M = 5
export const STREET_VIEW_PANO_MAX_M = 45

/** Great-circle (haversine) distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial great-circle bearing from `from` to `to`, in degrees, 0 (north) up to but not including 360. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const rad = Math.PI / 180
  const p1 = from.lat * rad
  const p2 = to.lat * rad
  const dl = (to.lng - from.lng) * rad
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  const deg = (Math.atan2(y, x) / rad + 360) % 360
  // Round-off can land on exactly 360 (for example -1e-15 + 360).
  return deg >= 360 ? 0 : deg
}

/**
 * Only a result Google pinned to the actual building (or interpolated along
 * its street) is precise enough to aim a camera at. APPROXIMATE and
 * GEOMETRIC_CENTER (a street, a ZIP, a city) would point at the wrong thing.
 */
export function isPreciseGeocode(locationType: string | null | undefined): boolean {
  return locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED'
}

/**
 * Geocoding is billed per request. The photo route is the only caller and
 * its response is cached privately for a day, so this runs about once a day
 * per home per browser. Google's terms allow caching lat/lng only
 * temporarily, so the coordinates are never stored in our database.
 */
export function geocodeUrl(address: string, key: string, signingSecret?: string | null): string {
  const q = new URLSearchParams({ address, key })
  const url = `${GEOCODE_BASE}?${q.toString()}`
  return signingSecret ? signStreetViewUrl(url, signingSecret) : url
}

/** Free metadata call for the panorama nearest to a point (the house). */
export function panoMetadataUrl(house: LatLng, key: string, signingSecret?: string | null): string {
  const q = new URLSearchParams({
    location: `${house.lat},${house.lng}`,
    source: 'outdoor',
    radius: String(STREET_VIEW_PANO_RADIUS_M),
    key,
  })
  const url = `${BASE}/metadata?${q.toString()}`
  return signingSecret ? signStreetViewUrl(url, signingSecret) : url
}

/** The picture from a chosen panorama, aimed at `heading` degrees. */
export function aimedImageUrl(panoId: string, heading: number, key: string, signingSecret?: string | null): string {
  const q = new URLSearchParams({
    size: STREET_VIEW_SIZE,
    pano: panoId,
    heading: String(Math.round(heading * 10) / 10),
    pitch: String(STREET_VIEW_PITCH_AIMED),
    fov: String(STREET_VIEW_FOV_AIMED),
    return_error_code: 'true',
    key,
  })
  const url = `${BASE}?${q.toString()}`
  return signingSecret ? signStreetViewUrl(url, signingSecret) : url
}
