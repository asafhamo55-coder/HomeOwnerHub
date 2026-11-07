// POST   /api/properties/:id/photo/upload — set the home's own photo (M20)
// DELETE /api/properties/:id/photo/upload — remove it; Street View shows again
//
// Dark until M20_APPLIED (migration 0086, OA-54): with the flag off both
// answer 404, exactly like a route that does not exist.
//
// Who (RC-4): board and admin for any home in their org; an owner or resident
// only for a home they are linked to. Checked here from the database's own
// auth_resident_property_ids(), and again inside set_property_photo(), the only
// write path a resident has to hoa_properties. Anyone else: 403. A home outside
// the caller's org (or one RLS hides): 404.
//
// 200 { uploaded: true }          POST ok
// 200 { removed: true }           DELETE ok
// 400 validation_failed           — malformed multipart or no file
// 403 forbidden                   — not your home
// 404 not_found                   — flag off, or no such home in your org
// 413 payload_too_large           — over 5 MB
// 415 unsupported_media_type      — not JPEG, PNG or WebP (by name or by the bytes)
// 422 unprocessable               — the file is damaged or is not a picture
//
// The picture is decoded and re-encoded as a JPEG at most 1600 px wide; EXIF
// and every other tag are dropped. It is stored at {org}/{property}/front.jpg
// in the private property-photos bucket. Ids and byte counts are logged, never
// a file name, address or any picture content.

import { NextResponse } from 'next/server'
import { M20_APPLIED } from '@homeowner-portal/db/m20'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteMember } from '@/lib/api/auth'
import { parseForm } from '@/lib/api/parse'
import { checkWrite } from '@/lib/api/db'
import { logRouteEvent, logRouteFailure } from '@/lib/api/log'
import { zUuid } from '@/lib/api/schemas'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { processPhoto } from '@/lib/properties/photo-upload/process'
import {
  canChangePhoto,
  PHOTO_BUCKET,
  PHOTO_MAX_BYTES,
  resolvePhotoType,
  uploadedPhotoPath,
} from '@/lib/properties/photo-upload/rules'

type Ctx = { params: Promise<{ id: string }> }

const NOT_YOURS = 'You can only change the photo of your own home.'
const WRONG_TYPE = 'Choose a JPG, PNG or WebP picture.'

/** Gate shared by both methods. Returns what the work needs. */
async function gate(ctx: Ctx) {
  if (!M20_APPLIED) throw new ApiRouteError('not_found') // dark: indistinguishable from no route
  const { orgId, role } = await requireRouteMember() // 401 / 403 before the body is read
  const parsed = zUuid.safeParse((await ctx.params).id)
  if (!parsed.success) throw new ApiRouteError('not_found')
  const propertyId = parsed.data

  const supabase = await getSupabaseServerClient()
  const { data: property, error } = await supabase
    .from('hoa_properties')
    .select('id, photo_path')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle<{ id: string; photo_path: string | null }>()
  if (error) {
    logRouteFailure('properties.photo.upload.read', error, { orgId, propertyId })
    throw new ApiRouteError('internal')
  }
  if (!property) throw new ApiRouteError('not_found')

  let residentPropertyIds: string[] = []
  if (role === 'resident') {
    const { data, error: rpcError } = await supabase.rpc('auth_resident_property_ids')
    if (rpcError) {
      logRouteFailure('properties.photo.upload.ids', rpcError, { orgId, propertyId })
      throw new ApiRouteError('internal')
    }
    residentPropertyIds = data ?? []
  }
  if (!canChangePhoto({ role, propertyId, residentPropertyIds })) throw new ApiRouteError('forbidden', NOT_YOURS)

  return { supabase, orgId, propertyId, previousPath: property.photo_path }
}

export const POST = withRoute('properties.photo.upload', async (request: Request, ctx: Ctx) => {
  const { supabase, orgId, propertyId, previousPath } = await gate(ctx)

  const form = await parseForm(request, { maxBytes: PHOTO_MAX_BYTES + 256 * 1024 })
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiRouteError('validation_failed', 'Choose a photo to upload.', {
      issues: [{ path: 'file', message: 'A photo is required.' }],
    })
  }
  if (file.size > PHOTO_MAX_BYTES) throw new ApiRouteError('payload_too_large', 'The photo must be 5 MB or smaller.', { maxBytes: PHOTO_MAX_BYTES })
  if (!resolvePhotoType(file)) throw new ApiRouteError('unsupported_media_type', WRONG_TYPE)

  const processed = await processPhoto(Buffer.from(await file.arrayBuffer()))
  if (!processed.ok) {
    if (processed.reason === 'too_large') throw new ApiRouteError('payload_too_large', 'The photo must be 5 MB or smaller.', { maxBytes: PHOTO_MAX_BYTES })
    if (processed.reason === 'wrong_format') throw new ApiRouteError('unsupported_media_type', WRONG_TYPE)
    throw new ApiRouteError('unprocessable', 'We could not read that picture. Try a different photo.', { reason: 'not_an_image' })
  }

  // Server-built path from the gate's org and the home's id; the client's file name never reaches it.
  const path = uploadedPhotoPath(orgId, propertyId)
  const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, processed.bytes, {
    contentType: 'image/jpeg',
    cacheControl: '60',
    upsert: true,
  })
  checkWrite(upload, 'properties.photo.upload.store', { orgId, propertyId, bytes: processed.bytes.byteLength })

  const set = await supabase.rpc('set_property_photo', { p_property_id: propertyId, p_path: path })
  if (set.error) {
    // The file is stored but the home does not point at it. With no earlier photo
    // that is an orphan: remove it. With an earlier one the path is the same
    // object (now the new picture), so leave it and let the owner retry.
    if (!previousPath) await supabase.storage.from(PHOTO_BUCKET).remove([path])
    logRouteFailure('properties.photo.upload.set', set.error, { orgId, propertyId })
    throw new ApiRouteError('internal')
  }

  logRouteEvent('properties.photo.upload', { event: 'photo_uploaded', orgId, propertyId, bytes: processed.bytes.byteLength })
  return NextResponse.json({ uploaded: true })
})

export const DELETE = withRoute('properties.photo.remove', async (_request: Request, ctx: Ctx) => {
  const { supabase, orgId, propertyId } = await gate(ctx)

  // The row first: once it points nowhere, Street View shows again.
  const set = await supabase.rpc('set_property_photo', { p_property_id: propertyId, p_path: null })
  checkWrite(set, 'properties.photo.remove.set', { orgId, propertyId })

  // A leftover file is harmless (nothing points at it) and is overwritten by the next upload.
  const removed = await supabase.storage.from(PHOTO_BUCKET).remove([uploadedPhotoPath(orgId, propertyId)])
  if (removed.error) logRouteFailure('properties.photo.remove.file', removed.error, { orgId, propertyId })

  logRouteEvent('properties.photo.upload', { event: 'photo_removed', orgId, propertyId })
  return NextResponse.json({ removed: true })
})
