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

export const STREET_VIEW_SIZE = '640x400'

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
    fov: '80',
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
