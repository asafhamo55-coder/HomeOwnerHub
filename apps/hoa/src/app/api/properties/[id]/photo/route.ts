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
// Never logged: the Google URLs (they carry the key) and the address.

import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError, apiError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { zUuid } from '@/lib/api/schemas'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { asPropertyId, resolveUnitForProperty } from '@/lib/properties/resolve'
import { streetViewLocation, streetViewUrls, type LocationFallback } from '@/lib/properties/street-view'

const FETCH_TIMEOUT_MS = 6000
const CACHE_OK = 'private, max-age=86400'
const CACHE_MISS = 'private, max-age=3600'

const notFound = () => apiError('not_found', 'No picture is available for this home.', undefined, { 'Cache-Control': CACHE_MISS })

// A short private cache, so a Google outage or a refused key is not retried on
// every page view (each retry is another call to Google).
const upstreamDown = () =>
  new ApiRouteError('upstream_unavailable', undefined, undefined, { 'Cache-Control': 'private, max-age=60' })

interface PropertyRow {
  address: string | null
}

export const GET = withRoute('properties.photo', async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { orgId } = await requireRouteMember()

  const parsedId = zUuid.safeParse((await ctx.params).id)
  if (!parsedId.success) return notFound()
  const propertyId = parsedId.data

  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!key) return notFound()

  const supabase = await getSupabaseServerClient()
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
  if (!property?.address) return notFound()

  // A street-only address borrows the community's city, state and ZIP.
  // Best effort: a failed lookup only means the address is used as saved.
  let unit: LocationFallback | null = null
  try {
    const { unitId } = await resolveUnitForProperty(supabase, orgId, asPropertyId(propertyId))
    if (unitId) {
      const { data } = await supabase
        .from('units')
        .select('city, state, postal_code')
        .eq('organization_id', orgId)
        .eq('id', unitId)
        .maybeSingle<LocationFallback>()
      unit = data
    }
  } catch (err) {
    logRouteFailure('properties.photo.unit', err, { orgId, propertyId })
  }

  const location = streetViewLocation(property.address, unit)
  if (!location) return notFound()

  const urls = streetViewUrls(location, key, process.env.GOOGLE_MAPS_URL_SIGNING_SECRET?.trim() || null)

  // 1. Free coverage check.
  let meta: Response
  try {
    meta = await fetch(urls.metadata, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
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
  if (status.data.status === 'ZERO_RESULTS' || status.data.status === 'NOT_FOUND') return notFound()
  if (status.data.status !== 'OK') {
    // REQUEST_DENIED, OVER_QUERY_LIMIT, INVALID_REQUEST, UNKNOWN_ERROR: a code, never Google's text.
    logRouteFailure('properties.photo.metadata', { code: status.data.status }, { orgId, propertyId })
    throw upstreamDown()
  }

  // 2. The picture (billed by Google), passed straight through.
  let image: Response
  try {
    image = await fetch(urls.image, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  } catch (err) {
    logRouteFailure('properties.photo.image', err, { orgId, propertyId })
    throw upstreamDown()
  }
  if (image.status === 404) return notFound()
  const type = image.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!image.ok || !image.body || !type.startsWith('image/')) {
    logRouteFailure('properties.photo.image', { code: String(image.status) }, { orgId, propertyId })
    throw upstreamDown()
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

