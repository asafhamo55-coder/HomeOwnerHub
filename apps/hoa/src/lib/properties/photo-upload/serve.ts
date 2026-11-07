// The uploaded photo, served. The photo route calls this FIRST, so an uploaded
// photo always wins over Street View (no Google call is made at all).
//
// Flag off: returns null without touching the database. Flag on: reads the
// stored path through the caller's own session (RLS), trusts it only if it is
// exactly this org's and this home's, signs a short-lived link and streams the
// bytes. The signed link never leaves the server and is never logged.

import { M20_APPLIED } from '@homeowner-portal/db/m20'
import type { getSupabaseServerClient } from '@/lib/supabase/server'
import { logRouteFailure } from '@/lib/api/log'
import { isOwnPhotoPath, PHOTO_BUCKET, PHOTO_SIGNED_URL_SECONDS } from './rules'

export type PhotoServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

const FETCH_TIMEOUT_MS = 6000

/** The stored photo path of a home in this org, or null. Flag off: always null. */
export async function readPhotoPath(
  supabase: PhotoServerClient,
  orgId: string,
  propertyId: string,
  flagOn: boolean = M20_APPLIED,
): Promise<string | null> {
  if (!flagOn) return null
  const { data, error } = await supabase
    .from('hoa_properties')
    .select('photo_path')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle<{ photo_path: string | null }>()
  if (error) {
    logRouteFailure('properties.photo.upload.read', error, { orgId, propertyId })
    return null
  }
  return isOwnPhotoPath(data?.photo_path, orgId, propertyId) ? data!.photo_path : null
}

/** A response with the uploaded photo, or null (flag off, none stored, or storage failed: fall back to Street View). */
export async function serveUploadedPhoto(
  supabase: PhotoServerClient,
  orgId: string,
  propertyId: string,
  flagOn: boolean = M20_APPLIED,
): Promise<Response | null> {
  const path = await readPhotoPath(supabase, orgId, propertyId, flagOn)
  if (!path) return null
  try {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_SIGNED_URL_SECONDS)
    if (error || !data?.signedUrl) {
      logRouteFailure('properties.photo.upload.sign', error ?? {}, { orgId, propertyId })
      return null
    }
    const res = await fetch(data.signedUrl, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok || !res.body) {
      logRouteFailure('properties.photo.upload.fetch', { code: String(res.status) }, { orgId, propertyId })
      return null
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        // Replace and remove must show at once, so the browser always asks again.
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Photo-Source': 'upload',
      },
    })
  } catch (err) {
    logRouteFailure('properties.photo.upload.serve', err, { orgId, propertyId })
    return null
  }
}
