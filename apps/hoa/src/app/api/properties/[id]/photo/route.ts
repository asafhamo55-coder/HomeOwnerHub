// GET /api/properties/:id/photo — a Google Street View picture of the home.
//
// The browser asks this route, never Google, so the API key stays on the
// server (GOOGLE_MAPS_API_KEY) and the page needs no new img-src.
//
// Who may ask (RC-4): any member of the caller's org, then the property is
// read through the caller's own session. RLS lets that read through only for
// a board member or admin of the org, or a resident of that very home
// (hoa_properties_select, 0063), so anyone else gets 404, the same answer as
// a missing property.
//
// 200 image/jpeg        — streamed, Cache-Control: private, max-age=86400
//                         (an uploaded photo, M20, is served first and never calls Google)
// 401 unauthenticated   — no session
// 403 forbidden         — no org, or a role that reads no tenant data
// 404 not_found         — bad id, not visible, no key, or Google has no imagery
//                         (also cached an hour, so a gap is not retried on every load)
// 503 upstream_unavailable — Google is down, over quota or refused the key
//
// Google's terms do not allow storing the picture, so it is never saved:
// the free metadata call checks coverage, then the image is passed through.
// A rate limit is not added here: the only shared limiter in this repo is the
// AI ledger (lib/api/rate-limit.ts), and the day-long private cache plus the
// membership gate keep repeat loads off Google. See OA-46 for the budget alert.
//
// Aiming: without a heading Google points the camera wherever the Street View
// car faced, often the road or a neighbour. So the house is geocoded first
// (precise results only), the nearest panorama is found, and the camera is
// aimed from the panorama at the house. Every step fails safe to the older
// address-only request. Geocoding is billed per request (OA-46).
//
// Never logged: the Google URLs (they carry the key) and the address.

import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError, apiError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { logRouteEvent, logRouteFailure } from '@/lib/api/log'
import { zUuid } from '@/lib/api/schemas'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { PHOTO_REASON_HEADER, type PhotoReason } from '@/lib/properties/photo-reason'
import { serveUploadedPhoto } from '@/lib/properties/photo-upload/serve'
import { formatAddress } from '@/lib/properties/address-format'
import { readCommunityLocation } from '@/lib/association-location'
import { asPropertyId, resolveUnitForProperty } from '@/lib/properties/resolve'
import {
  aimedImageUrl,
  STREET_VIEW_PANO_MAX_M,
  STREET_VIEW_PANO_MIN_M,
  bearingDegrees,
  distanceMeters,
  geocodeUrl,
  isPreciseGeocode,
  panoMetadataUrl,
  streetViewLocation,
  streetViewUrls,
  type LatLng,
  type LocationFallback,
} from '@/lib/properties/street-view'

const FETCH_TIMEOUT_MS = 6000
const CACHE_OK = 'private, max-age=86400'
const CACHE_MISS = 'private, max-age=3600'

// One info line per miss or fallback: a reason code and the property id only.
type Ctx = { orgId: string; propertyId: string }
// Google statuses are logged only when they are known values.
const GEOCODE_STATUSES = ['OK', 'ZERO_RESULTS', 'OVER_DAILY_LIMIT', 'OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR', 'bad_body']
const PANO_STATUSES = ['OK', 'ZERO_RESULTS', 'NOT_FOUND', 'OVER_QUERY_LIMIT', 'REQUEST_DENIED', 'INVALID_REQUEST', 'UNKNOWN_ERROR', 'bad_body']
const LOCATION_TYPES = ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE', 'none']
const known = (v: string, allowed: string[]) => (allowed.includes(v) ? v : 'other')

function logPhoto(outcome: 'miss' | 'fallback', reason: string, ctx: { propertyId: string }, extra: Record<string, string | number> = {}) {
  logRouteEvent('properties.photo', { event: 'property_photo', outcome, reason, propertyId: ctx.propertyId, ...extra })
}

// The reason code rides in a header so the page can say why (never the address).
const notFound = (reason: PhotoReason = 'unknown') =>
  apiError('not_found', 'No picture is available for this home.', undefined, {
    'Cache-Control': CACHE_MISS,
    [PHOTO_REASON_HEADER]: reason,
  })

// A short private cache, so a Google outage or a refused key is not retried on
// every page view (each retry is another call to Google).
const upstreamDown = () =>
  new ApiRouteError('upstream_unavailable', undefined, undefined, {
    'Cache-Control': 'private, max-age=60',
    [PHOTO_REASON_HEADER]: 'upstream',
  })

// One overall budget across every Google call in a request, so a slow Google
// cannot stack four 6 s calls. Each call gets the smaller of 6 s and what is
// left, but never less than a 1.5 s floor so the old path still gets a chance.
const TOTAL_BUDGET_MS = 10_000
const MIN_CALL_MS = 1500
const AIMED_MIN_LEFT_MS = 4000

function makeClock() {
  const end = Date.now() + TOTAL_BUDGET_MS
  const left = () => end - Date.now()
  const opts = () => ({
    cache: 'no-store' as const,
    redirect: 'error' as const,
    signal: AbortSignal.timeout(Math.max(MIN_CALL_MS, Math.min(FETCH_TIMEOUT_MS, left()))),
  })
  return { left, opts }
}
type Clock = ReturnType<typeof makeClock>

const geocodeBody = z.object({
  status: z.string(),
  results: z
    .array(z.object({ partial_match: z.boolean().optional(), geometry: z.object({ location: z.object({ lat: z.number(), lng: z.number() }), location_type: z.string() }) }))
    .optional(),
})
const panoBody = z.object({
  status: z.string(),
  pano_id: z.string().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
})

/**
 * The aimed image URL, or null for "use the address-only request". Never throws;
 * logs only a status code or error, never the address.
 */
async function aimedImage(
  address: string,
  key: string,
  secret: string | null,
  logCtx: Ctx,
  clock: Clock,
): Promise<string | null> {
  // Too little time for geocode + pano + image: go straight to the old path.
  if (clock.left() < AIMED_MIN_LEFT_MS) return null
  let house: LatLng
  try {
    const res = await fetch(geocodeUrl(address, key, secret), clock.opts())
    if (!res.ok) {
      logRouteFailure('properties.photo.geocode', { code: String(res.status) }, logCtx)
      logPhoto('fallback', 'geocode_http_error', logCtx, { geocodeHttp: res.status })
      return null
    }
    const body = geocodeBody.safeParse(await res.json().catch(() => null))
    if (!body.success || body.data.status !== 'OK') {
      // REQUEST_DENIED until the Geocoding API is enabled (OA-46): a code only.
      const code = body.success ? body.data.status : 'bad_body'
      logRouteFailure('properties.photo.geocode', { code }, logCtx)
      logPhoto('fallback', code === 'ZERO_RESULTS' ? 'geocode_zero_results' : code === 'bad_body' ? 'geocode_bad_body' : 'geocode_denied', logCtx, { geocodeStatus: known(code, GEOCODE_STATUSES) })
      return null
    }
    const first = body.data.results?.[0]
    // A partial match means Google guessed at part of the address.
    if (first?.partial_match === true) {
      logPhoto('fallback', 'geocode_imprecise', logCtx, { geocodeStatus: 'OK', detail: 'partial_match' })
      return null
    }
    const geometry = first?.geometry
    if (!geometry || !isPreciseGeocode(geometry.location_type)) {
      logPhoto('fallback', 'geocode_imprecise', logCtx, { geocodeStatus: 'OK', locationType: known(geometry?.location_type ?? 'none', LOCATION_TYPES) })
      return null
    }
    house = geometry.location
  } catch (err) {
    logRouteFailure('properties.photo.geocode', err, logCtx)
    logPhoto('fallback', 'geocode_error', logCtx)
    return null
  }

  try {
    if (clock.left() < MIN_CALL_MS * 2) {
      logPhoto('fallback', 'budget_exhausted', logCtx)
      return null
    }
    const res = await fetch(panoMetadataUrl(house, key, secret), clock.opts())
    if (!res.ok) {
      logRouteFailure('properties.photo.pano', { code: String(res.status) }, logCtx)
      logPhoto('fallback', 'pano_http_error', logCtx, { panoHttp: res.status })
      return null
    }
    const body = panoBody.safeParse(await res.json().catch(() => null))
    if (!body.success || body.data.status !== 'OK' || !body.data.pano_id || !body.data.location) {
      const code = body.success ? body.data.status : 'bad_body'
      if (code !== 'ZERO_RESULTS') logRouteFailure('properties.photo.pano', { code }, logCtx)
      logPhoto('fallback', code === 'ZERO_RESULTS' ? 'pano_zero_results' : 'pano_not_ok', logCtx, { panoStatus: known(code, PANO_STATUSES) })
      return null
    }
    // Too close: inside the lot. Too far: a back alley or cross street, which would not face the front.
    const dist = distanceMeters(body.data.location, house)
    if (dist < STREET_VIEW_PANO_MIN_M || dist > STREET_VIEW_PANO_MAX_M) {
      logPhoto('fallback', dist < STREET_VIEW_PANO_MIN_M ? 'pano_too_close' : 'pano_too_far', logCtx, { distanceM: Math.round(dist) })
      return null
    }
    return aimedImageUrl(body.data.pano_id, bearingDegrees(body.data.location, house), key, secret)
  } catch (err) {
    logRouteFailure('properties.photo.pano', err, logCtx)
    logPhoto('fallback', 'pano_error', logCtx)
    return null
  }
}

const hasPlace = (l: LocationFallback | null): l is LocationFallback =>
  Boolean(l && (l.city?.trim() || l.state?.trim() || l.postal_code?.trim()))

interface PropertyRow {
  address: string | null
}

export const GET = withRoute('properties.photo', async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { orgId } = await requireRouteMember()

  const parsedId = zUuid.safeParse((await ctx.params).id)
  if (!parsedId.success) return notFound('not_visible')
  const propertyId = parsedId.data

  // M20: an uploaded photo always wins over Street View, so it is checked
  // first, before the key or the address matter. Flag off: no query, null.
  const supabase = await getSupabaseServerClient()
  const uploaded = await serveUploadedPhoto(supabase, orgId, propertyId)
  if (uploaded) return uploaded

  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!key) {
    logPhoto('miss', 'no_key', { propertyId })
    return notFound('no_key')
  }

  const { data: property, error } = await supabase
    .from('hoa_properties')
    .select('address')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle<PropertyRow>()
  if (error) {
    logRouteFailure('properties.photo.read', error, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!property) {
    logPhoto('miss', 'row_not_visible', { propertyId })
    return notFound('not_visible')
  }
  if (!property.address) {
    logPhoto('miss', 'no_address', { propertyId })
    return notFound('no_address')
  }

  // A street-only address borrows the community's city, state and ZIP.
  // Best effort: a failed lookup only means the address is used as saved.
  let unit: LocationFallback | null = null
  let association: LocationFallback | null = null
  try {
    const { unitId } = await resolveUnitForProperty(supabase, orgId, asPropertyId(propertyId))
    if (unitId) {
      const { data } = await supabase
        .from('units')
        .select('city, state, postal_code, association_id')
        .eq('organization_id', orgId)
        .eq('id', unitId)
        .maybeSingle<LocationFallback & { association_id?: string | null }>()
      unit = data
      // Many rosters keep only the street line. The associations table has a
      // state (no city or ZIP), so that is the last place to borrow from.
      if (!hasPlace(unit) && data?.association_id) {
        const { data: assoc } = await supabase
          .from('associations')
          .select('state, compliance_settings')
          .eq('organization_id', orgId)
          .eq('id', data.association_id)
          .maybeSingle<{ state: string | null; compliance_settings: unknown }>()
        if (assoc) {
          // The board's own city and ZIP (Settings > Association) make this safe to geocode.
          const loc = readCommunityLocation(assoc.compliance_settings)
          if (assoc.state?.trim() || loc.city || loc.zip) {
            association = { state: assoc.state, city: loc.city, postal_code: loc.zip }
          }
        }
      }
    }
  } catch (err) {
    logRouteFailure('properties.photo.unit', err, { orgId, propertyId })
  }

  const fallback = hasPlace(unit) ? unit : association
  const location = streetViewLocation(property.address, fallback)
  if (!location) {
    logPhoto('miss', 'no_location', { propertyId })
    return notFound('needs_location')
  }
  // A street with at most a bare state ("105 Springwood Pkwy, GA") can come
  // back as a confident photo of the wrong house in another city, and neither
  // ROOFTOP nor partial_match catches it. Never call Google for it.
  const own = formatAddress(property.address)
  const placed = own.city || own.zip || fallback?.city?.trim() || fallback?.postal_code?.trim()
  if (!placed) {
    logPhoto('miss', 'state_only_location', { propertyId })
    return notFound('needs_location')
  }

  const secret = process.env.GOOGLE_MAPS_URL_SIGNING_SECRET?.trim() || null
  const urls = streetViewUrls(location, key, secret)

  // 0. Aim at the house when we can (geocode, then nearest panorama; the
  // panorama lookup doubles as the coverage check). Null means the older path.
  const clock = makeClock()
  const aimed = await aimedImage(location, key, secret, { orgId, propertyId }, clock)

  // 0b. The aimed picture. Any failure (404, 5xx, not an image, timeout) falls
  // back to the address-only flow below instead of giving up.
  let image: Response | null = null
  if (aimed) {
    try {
      const r = await fetch(aimed, clock.opts())
      const t = r.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
      if (r.ok && r.body && t.startsWith('image/')) image = r
      else {
        logRouteFailure('properties.photo.aimed', { code: String(r.status) }, { orgId, propertyId })
        logPhoto('fallback', 'aimed_image_failed', { propertyId }, { imageHttp: r.status })
      }
    } catch (err) {
      logRouteFailure('properties.photo.aimed', err, { orgId, propertyId })
      logPhoto('fallback', 'aimed_image_error', { propertyId })
    }
  }

  if (!image) {
    // 1. Free coverage check.
    let meta: Response
    try {
      meta = await fetch(urls.metadata, clock.opts())
    } catch (err) {
      logRouteFailure('properties.photo.metadata', err, { orgId, propertyId })
      throw upstreamDown()
    }
    if (!meta.ok) {
      logRouteFailure('properties.photo.metadata', { code: String(meta.status) }, { orgId, propertyId })
      throw upstreamDown()
    }
    const status = z.object({ status: z.string() }).safeParse(await meta.json().catch(() => null))
    if (!status.success) throw upstreamDown()
    if (status.data.status === 'ZERO_RESULTS' || status.data.status === 'NOT_FOUND') {
      logPhoto('miss', status.data.status === 'ZERO_RESULTS' ? 'meta_zero_results' : 'meta_not_found', { propertyId }, { metaStatus: known(status.data.status, PANO_STATUSES) })
      return notFound('no_street_view')
    }
    if (status.data.status !== 'OK') {
      // REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST, UNKNOWN_ERROR: a code, never Google's text.
      logRouteFailure('properties.photo.metadata', { code: status.data.status }, { orgId, propertyId })
      throw upstreamDown()
    }
  }

  // 2. The picture (billed by Google), passed straight through.
  if (!image) {
    let plain: Response
    try {
      plain = await fetch(urls.image, clock.opts())
    } catch (err) {
      logRouteFailure('properties.photo.image', err, { orgId, propertyId })
      throw upstreamDown()
    }
    if (plain.status === 404) {
      logPhoto('miss', 'image_404', { propertyId }, { imageHttp: 404 })
      return notFound('no_street_view')
    }
    const type = plain.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!plain.ok || !plain.body || !type.startsWith('image/')) {
      logRouteFailure('properties.photo.image', { code: String(plain.status) }, { orgId, propertyId })
      throw upstreamDown()
    }
    image = plain
  }

  return new Response(image.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': CACHE_OK,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

