import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'hoa-photos'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

function safeName(original: string): string {
  const dot = original.lastIndexOf('.')
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

export async function POST(request: Request) {
  const org = await getCurrentOrg()
  if (!org) return NextResponse.json({ error: 'no_org' }, { status: 403 })

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'too_large', message: 'Photo must be under 25 MB.' }, { status: 400 })
  }
  if (file.type && !ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'wrong_type', message: 'Photo must be JPG, PNG, WebP, or HEIC.' },
      { status: 400 },
    )
  }

  const supabase = await getSupabaseServerClient()
  const storagePath = `${org.id}/${safeName(file.name)}`

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
            "Couldn't find the 'hoa-photos' bucket. Create it (Private) in the Supabase dashboard, then try again.",
        },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: 'upload_failed', message: uploadError.message }, { status: 500 })
  }

  const { data: signed } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60) // 1 hour, plenty for the AI vision pass

  return NextResponse.json({
    storagePath,
    signedUrl: signed?.signedUrl ?? null,
  })
}
