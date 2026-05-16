import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'hoa-documents'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
])
const ALLOWED_DOC_TYPES = new Set(['coi', 'w9', 'license', 'contract', 'other'])

function safeName(original: string): string {
  const dot = original.lastIndexOf('.')
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

// POST /api/vendors/[id]/documents
// Multipart form with: file=<file>, docType=<coi|w9|license|contract|other>
// On success returns { storagePath, documentId }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const org = await getCurrentOrg()
  if (!org) return NextResponse.json({ error: 'no_org' }, { status: 403 })

  const { id: vendorId } = await params

  const formData = await request.formData()
  const file = formData.get('file')
  const docType = String(formData.get('docType') ?? '')

  if (!ALLOWED_DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: 'bad_doc_type' }, { status: 400 })
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'too_large', message: 'File must be under 25 MB.' },
      { status: 400 },
    )
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'wrong_type', message: 'File must be PDF or image (JPG/PNG/WebP/HEIC).' },
      { status: 400 },
    )
  }

  const supabase = await getSupabaseServerClient()

  // Confirm the vendor belongs to this org (RLS would also block, but
  // checking explicitly gives a cleaner 404 instead of a generic 500).
  const { data: vendor } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('id', vendorId)
    .maybeSingle<{ id: string }>()
  if (!vendor) {
    return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 })
  }

  const storagePath = `${org.id}/vendors/${vendorId}/${docType}/${safeName(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes('not found')) {
      return NextResponse.json(
        {
          error: 'bucket_missing',
          message:
            "Couldn't find the 'hoa-documents' bucket. Create it (Private) in Supabase, then try again.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json(
      { error: 'upload_failed', message: uploadError.message },
      { status: 500 },
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: row, error: insertError } = await supabase
    .from('vendor_documents' as never)
    .insert({
      organization_id: org.id,
      vendor_id: vendorId,
      doc_type: docType,
      storage_path: storagePath,
      uploaded_by: user?.id ?? null,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (insertError || !row) {
    // Best-effort cleanup of the orphaned upload so we don't leak bytes.
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    return NextResponse.json(
      { error: 'record_failed', message: insertError?.message ?? 'unknown' },
      { status: 500 },
    )
  }

  return NextResponse.json({ storagePath, documentId: row.id })
}
