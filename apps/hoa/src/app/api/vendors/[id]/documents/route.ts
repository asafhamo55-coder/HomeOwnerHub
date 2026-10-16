import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseForm, parseValue } from '@/lib/api/parse'
import { zDateOnly, zUuid } from '@/lib/api/schemas'
import { MAX_UPLOAD_BYTES } from '@/lib/api/limits'
import { checkWrite } from '@/lib/api/db'
import { errorCode, logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'hoa-documents'

/** MIME allowlist → the extension the stored object gets. */
const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
}

/**
 * Some browsers send no MIME type for HEIC (and occasionally others). Fall
 * back to the file extension, still against the same allowlist.
 */
const TYPE_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
}

const WRONG_TYPE = 'File must be PDF or image (JPG/PNG/WebP/HEIC).'
const TOO_LARGE = `File must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`

const Fields = z.object({
  docType: z.enum(['coi', 'w9', 'license', 'contract', 'other']),
  expiresAt: zDateOnly.optional(),
})

function resolveContentType(file: File): string | null {
  // A multipart part with no type arrives as application/octet-stream.
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type in ALLOWED_TYPES ? file.type : null
  }
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  return TYPE_BY_EXTENSION[ext] ?? null
}

/** Server-built object name. Nothing from the client's file name reaches the path. */
function objectName(contentType: string): string {
  return `${Date.now()}-${crypto.randomUUID()}${ALLOWED_TYPES[contentType]}`
}

// POST /api/vendors/[id]/documents — board-only (vendor compliance lives under (dashboard)).
// Multipart form: file=<file>, docType=<coi|w9|license|contract|other>, expiresAt?=<YYYY-MM-DD>
// 201 { storagePath, documentId }.
export const POST = withRoute(
  'vendors.documents.create',
  async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { orgId } = await requireRouteBoardOrAdmin()

    const { id } = await ctx.params
    const vendorId = parseValue(zUuid, id)

    const form = await parseForm(request)
    const fields = parseValue(Fields, {
      docType: form.get('docType') ?? undefined,
      expiresAt: form.get('expiresAt') || undefined,
    })
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      throw new ApiRouteError('validation_failed', 'Choose a file to upload.', {
        issues: [{ path: 'file', message: 'Choose a file to upload.' }],
      })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiRouteError('payload_too_large', TOO_LARGE, { maxBytes: MAX_UPLOAD_BYTES })
    }
    const contentType = resolveContentType(file)
    if (!contentType) throw new ApiRouteError('unsupported_media_type', WRONG_TYPE)

    await requireOrgOwned('vendors', vendorId, orgId, { message: 'We could not find that vendor.' })

    const supabase = await getSupabaseServerClient()
    const storagePath = `${orgId}/vendors/${vendorId}/${fields.docType}/${objectName(contentType)}`

    const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    })
    if (uploadError) {
      const code = errorCode(uploadError)
      logRouteFailure('vendors.documents.upload', uploadError, { orgId, vendorId })
      if (code === '404') {
        throw new ApiRouteError('not_configured', 'Document storage is not set up yet. Contact support.')
      }
      if (code === '413') {
        throw new ApiRouteError('payload_too_large', TOO_LARGE, { maxBytes: MAX_UPLOAD_BYTES })
      }
      throw new ApiRouteError('internal')
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data: row, error: insertError } = await supabase
      .from('vendor_documents' as never)
      .insert({
        organization_id: orgId,
        vendor_id: vendorId,
        doc_type: fields.docType,
        storage_path: storagePath,
        expires_at: fields.expiresAt ?? null,
        uploaded_by: user?.id ?? null,
      } as never)
      .select('id')
      .single<{ id: string }>()

    if (insertError || !row) {
      // Compensate (RC-6): remove the object we just uploaded so no orphan is left.
      const { data: removed, error: removeError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([storagePath])
      if (removeError || (removed?.length ?? 0) < 1) {
        // The orphaned object stays under ${orgId}/vendors/… with no vendor_documents row.
        logRouteFailure('vendors.documents.cleanup', removeError ?? { code: 'not_removed' }, { orgId, vendorId })
      }
      checkWrite({ error: insertError }, 'vendor_documents.insert', { orgId, vendorId })
      throw new ApiRouteError('internal')
    }

    revalidatePath(`/vendors/${vendorId}`)
    revalidatePath(`/vendors/${vendorId}/compliance`)

    return NextResponse.json({ storagePath, documentId: row.id }, { status: 201 })
  },
)
