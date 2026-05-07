'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = 'hoa-documents'
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

const UploadSchema = z.object({
  name: z.string().trim().min(2, 'Give the document a name.'),
  type: z.enum(['ccr', 'bylaws', 'rules', 'other'], {
    message: 'Pick a document type.',
  }),
  parsed_text: z.string().optional(),
})

export interface UploadActionState {
  error?: string
  fieldErrors?: Record<string, string>
}

function sanitizeStorageName(filename: string): string {
  // Supabase Storage paths must be ASCII-ish. Replace anything weird, keep
  // the extension, and add a timestamp prefix to avoid collisions.
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const ext = dot > 0 ? filename.slice(dot) : ''
  const safeBase = base.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase().slice(0, 80)
  return `${Date.now()}-${safeBase}${ext}`
}

export async function uploadDocument(
  _prev: UploadActionState,
  formData: FormData,
): Promise<UploadActionState> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: 'Pick a file to upload.' } }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { fieldErrors: { file: 'Max file size is 50 MB.' } }
  }

  const parsed = UploadSchema.safeParse({
    name: formData.get('name'),
    type: formData.get('type'),
    parsed_text: formData.get('parsed_text') ?? undefined,
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { fieldErrors }
  }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const storagePath = `${org.id}/${sanitizeStorageName(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })

  if (uploadError) {
    // Common one: bucket missing. Surface a helpful message.
    if (uploadError.message?.toLowerCase().includes('not found')) {
      return {
        error:
          "Couldn't find the 'hoa-documents' bucket. Create it (Private) in the Supabase dashboard, then try again.",
      }
    }
    return { error: uploadError.message }
  }

  const { error: rowError } = await supabase.from('hoa_documents').insert({
    org_id: org.id,
    name: parsed.data.name,
    type: parsed.data.type,
    storage_path: storagePath,
    file_size: file.size,
    parsed_text: parsed.data.parsed_text?.trim() || null,
    parsed_at: parsed.data.parsed_text?.trim() ? new Date().toISOString() : null,
  })

  if (rowError) {
    // Best-effort cleanup of the uploaded file if the row insert fails.
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    return { error: rowError.message }
  }

  revalidatePath('/documents')
  redirect('/documents')
}

export async function updateParsedText(documentId: string, parsedText: string) {
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('hoa_documents')
    .update({
      parsed_text: parsedText.trim() || null,
      parsed_at: parsedText.trim() ? new Date().toISOString() : null,
    })
    .eq('id', documentId)

  if (error) throw new Error(error.message)
  revalidatePath(`/documents/${documentId}`)
  revalidatePath('/documents')
}

export async function deleteDocument(documentId: string) {
  const supabase = await getSupabaseServerClient()
  const { data: doc } = await supabase
    .from('hoa_documents')
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle()

  if (doc?.storage_path) {
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path])
  }
  await supabase.from('hoa_documents').delete().eq('id', documentId)
  revalidatePath('/documents')
}
