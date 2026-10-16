// POST /api/violations/photo — the violation wizard's photo upload
// ((dashboard)/violations/new/Wizard.tsx, its only caller). Board-only
// (RC-4): the hoa-photos storage INSERT policy admits any org member, so
// this route is the only role boundary for the bucket.
//
// 200 { storagePath, signedUrl }  — signedUrl is null if signing failed
// 400 validation_failed           — malformed multipart or no file
// 413 payload_too_large           — over MAX_UPLOAD_BYTES
// 415 unsupported_media_type      — not JPG / PNG / WebP / HEIC
// 503 not_configured              — the hoa-photos bucket does not exist

import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseForm } from '@/lib/api/parse'
import { MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'hoa-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour, plenty for the AI vision pass

// Maps, not object literals: `key in {}` and `{}[key]` also match
// Object.prototype keys ('constructor', '__proto__', 'toString'), which a
// client controls through the part's Content-Type and the file name.
/** Allowed MIME type → the extension the stored object gets. */
const ALLOWED_TYPES: ReadonlyMap<string, string> = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
])

/** Some browsers send HEIC (and the odd JPEG) with no type, or octet-stream. */
const TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['heic', 'image/heic'],
])

const WRONG_TYPE = 'Photo must be JPG, PNG, WebP, or HEIC.'

/** The allowlisted MIME type for this file, or null (→ 415). */
function resolveContentType(file: File): string | null {
  const declared = file.type.split(';')[0]!.trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream') {
    return ALLOWED_TYPES.has(declared) ? declared : null
  }
  const dot = file.name.lastIndexOf('.')
  if (dot <= 0) return null
  return TYPE_BY_EXTENSION.get(file.name.slice(dot + 1).toLowerCase()) ?? null
}

export const POST = withRoute('violations.photo', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin() // 401 / 403 before the body is read
  const form = await parseForm(request) // 400 malformed, 413 over MAX_FORM_BYTES

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiRouteError('validation_failed', 'Choose a photo to upload.', {
      issues: [{ path: 'file', message: 'A photo is required.' }],
    })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiRouteError('payload_too_large', 'Photo must be under 25 MB.', { maxBytes: MAX_UPLOAD_BYTES })
  }
  const contentType = resolveContentType(file)
  if (!contentType) throw new ApiRouteError('unsupported_media_type', WRONG_TYPE)

  // Server-built path under the gate's org; the client's file name never
  // reaches it (RC-4).
  const ext = ALLOWED_TYPES.get(contentType)!
  const storagePath = `${orgId}/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const supabase = await getSupabaseServerClient()
  const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })
  if (uploadError) {
    logRouteFailure('violations.photo.upload', uploadError, { orgId, bytes: file.size })
    // Storage answers a missing bucket with statusCode "404" (older
    // servers) or "NoSuchBucket".
    const code = errorCode(uploadError)
    if (code === '404' || code === 'NoSuchBucket') {
      throw new ApiRouteError(
        'not_configured',
        'Photo storage is not set up yet. Ask an administrator to create the photo bucket.',
        { reason: 'bucket_missing' },
      )
    }
    throw new ApiRouteError('internal')
  }

  // A read, not a write: the photo is stored either way, so a signing
  // failure is logged and answered with signedUrl: null, as before.
  const { data: signed, error: signError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)
  if (signError) logRouteFailure('violations.photo.sign', signError, { orgId })

  return NextResponse.json({ storagePath, signedUrl: signed?.signedUrl ?? null })
})
