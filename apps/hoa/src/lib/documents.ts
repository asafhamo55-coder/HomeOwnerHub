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

  // Also collect every prior version's storage_path so the bucket
  // doesn't accumulate orphans. The hoa_document_versions row itself
  // cascade-deletes via FK ON DELETE CASCADE when the parent goes.
  const { data: versions } = await supabase
    .from('hoa_document_versions' as never)
    .select('storage_path')
    .eq('document_id' as never, documentId)
    .returns<{ storage_path: string }[]>()

  const paths = [
    ...(doc?.storage_path ? [doc.storage_path] : []),
    ...((versions ?? []).map((v) => v.storage_path)),
  ]
  if (paths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(paths)
  }
  await supabase.from('hoa_documents').delete().eq('id', documentId)
  revalidatePath('/documents')
  redirect('/documents')
}

// ─── replaceDocumentFile ─────────────────────────────────────────────

const ReplaceSchema = z.object({
  documentId: z.string().uuid(),
  reason: z.string().max(500).optional(),
})

export interface ReplaceActionState {
  error?: string
  fieldErrors?: Record<string, string>
}

/**
 * Replace the current file for an existing hoa_documents row. The
 * current state (storage_path, parsed_text, file_size, parsed_at,
 * name) is snapshotted into hoa_document_versions BEFORE the new file
 * is wired in, so a restore can later re-point at the old storage
 * object. Old storage objects are intentionally NOT deleted so version
 * downloads keep working — a bucket lifecycle policy can prune later
 * if space matters.
 *
 * Use the same UI shape as upload (FormData), so a Word .docx, PDF,
 * image, or anything else under 50 MB can replace whatever's there.
 * `reason` is an optional manager note that ends up on the version
 * row for audit ("Q2 2026 amendment per Board minutes 4/15").
 */
export async function replaceDocumentFile(
  _prev: ReplaceActionState,
  formData: FormData,
): Promise<ReplaceActionState> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: 'Pick a file to upload.' } }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { fieldErrors: { file: 'Max file size is 50 MB.' } }
  }

  const parsed = ReplaceSchema.safeParse({
    documentId: formData.get('documentId'),
    reason: (formData.get('reason') as string | null) ?? undefined,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const org = await getCurrentOrg()
  if (!org) return { error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()

  const { data: current, error: cErr } = await supabase
    .from('hoa_documents')
    .select('id, name, storage_path, file_size, parsed_text, parsed_at, org_id')
    .eq('id', parsed.data.documentId)
    .single()
  if (cErr || !current) return { error: cErr?.message ?? 'document not found' }
  if (current.org_id !== org.id) {
    return { error: 'document not in this org' }
  }

  // Snapshot current into hoa_document_versions BEFORE writing new
  // state. version_number is max(existing) + 1; on first replace it's
  // 1. We compute it client-side; the UNIQUE (document_id, version_number)
  // constraint catches any race.
  const { data: prior } = await supabase
    .from('hoa_document_versions' as never)
    .select('version_number')
    .eq('document_id' as never, current.id)
    .order('version_number' as never, { ascending: false })
    .limit(1)
    .returns<{ version_number: number }[]>()
  const nextVersion = (prior?.[0]?.version_number ?? 0) + 1

  const { error: vErr } = await supabase
    .from('hoa_document_versions' as never)
    .insert({
      document_id: current.id,
      org_id: current.org_id,
      version_number: nextVersion,
      name: current.name,
      storage_path: current.storage_path,
      file_size: current.file_size,
      parsed_text: current.parsed_text,
      parsed_at: current.parsed_at,
      reason: parsed.data.reason ?? null,
    } as never)
  if (vErr) {
    return {
      error:
        vErr.message +
        ' — confirm migrations/0010_hoa_document_versions.sql has been applied.',
    }
  }

  // Upload the new file at a fresh path so we don't clobber the
  // version we just archived.
  const newStoragePath = `${org.id}/${sanitizeStorageName(file.name)}`
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(newStoragePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
  if (upErr) {
    // Roll back the version row so we don't leave a stub pointing at
    // the (still-live) current file.
    await supabase
      .from('hoa_document_versions' as never)
      .delete()
      .eq('document_id' as never, current.id)
      .eq('version_number' as never, nextVersion)
    return { error: upErr.message }
  }

  const { error: updErr } = await supabase
    .from('hoa_documents')
    .update({
      storage_path: newStoragePath,
      file_size: file.size,
      // New file means the prior parse no longer matches — clear it so
      // the user re-parses (or runs the AI parse pipeline again).
      parsed_text: null,
      parsed_at: null,
    })
    .eq('id', current.id)
  if (updErr) {
    // Cleanup: drop the new file and the version row to leave state
    // untouched.
    await supabase.storage.from(STORAGE_BUCKET).remove([newStoragePath])
    await supabase
      .from('hoa_document_versions' as never)
      .delete()
      .eq('document_id' as never, current.id)
      .eq('version_number' as never, nextVersion)
    return { error: updErr.message }
  }

  revalidatePath(`/documents/${current.id}`)
  revalidatePath('/documents')
  return {}
}

// ─── restoreVersion ──────────────────────────────────────────────────

const RestoreSchema = z.object({
  versionId: z.string().uuid(),
})

/**
 * Snapshot the current state as a new version, then re-point the
 * hoa_documents row at the chosen version's storage_path + parsed_text.
 * After a restore, the version_number history shows: ..., N, N+1 (the
 * pre-restore state), and the current row matches version N's content.
 */
export async function restoreDocumentVersion(input: {
  versionId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = RestoreSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()

  type VersionRow = {
    id: string
    document_id: string
    org_id: string
    name: string
    storage_path: string
    file_size: number | null
    parsed_text: string | null
    parsed_at: string | null
  }
  const { data: versionRaw } = await supabase
    .from('hoa_document_versions' as never)
    .select(
      'id, document_id, org_id, name, storage_path, file_size, parsed_text, parsed_at',
    )
    .eq('id' as never, parsed.data.versionId)
    .single()
  const version = versionRaw as VersionRow | null
  if (!version) return { ok: false, error: 'version not found' }
  if (version.org_id !== org.id) {
    return { ok: false, error: 'version not in this org' }
  }

  const { data: current } = await supabase
    .from('hoa_documents')
    .select('id, name, storage_path, file_size, parsed_text, parsed_at, org_id')
    .eq('id', version.document_id)
    .single()
  if (!current) return { ok: false, error: 'document not found' }

  // Snapshot current state with a fresh version_number so the restore
  // is itself reversible.
  const { data: prior } = await supabase
    .from('hoa_document_versions' as never)
    .select('version_number')
    .eq('document_id' as never, current.id)
    .order('version_number' as never, { ascending: false })
    .limit(1)
    .returns<{ version_number: number }[]>()
  const nextVersion = (prior?.[0]?.version_number ?? 0) + 1

  const { error: vErr } = await supabase
    .from('hoa_document_versions' as never)
    .insert({
      document_id: current.id,
      org_id: current.org_id,
      version_number: nextVersion,
      name: current.name,
      storage_path: current.storage_path,
      file_size: current.file_size,
      parsed_text: current.parsed_text,
      parsed_at: current.parsed_at,
      reason: `Auto-snapshot before restoring version ${parsed.data.versionId.slice(0, 8)}`,
    } as never)
  if (vErr) return { ok: false, error: `version snapshot: ${vErr.message}` }

  const { error: updErr } = await supabase
    .from('hoa_documents')
    .update({
      storage_path: version.storage_path,
      file_size: version.file_size,
      parsed_text: version.parsed_text,
      parsed_at: version.parsed_at,
    })
    .eq('id', current.id)
  if (updErr) {
    await supabase
      .from('hoa_document_versions' as never)
      .delete()
      .eq('document_id' as never, current.id)
      .eq('version_number' as never, nextVersion)
    return { ok: false, error: updErr.message }
  }

  revalidatePath(`/documents/${current.id}`)
  revalidatePath('/documents')
  return { ok: true }
}

// ─── listDocumentVersions ────────────────────────────────────────────

export interface DocumentVersion {
  id: string
  version_number: number
  name: string
  storage_path: string
  file_size: number | null
  parsed_at: string | null
  reason: string | null
  created_at: string
}

/** Most-recent first. Used by the document detail page's history tab. */
export async function listDocumentVersions(
  documentId: string,
): Promise<DocumentVersion[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('hoa_document_versions' as never)
    .select('id, version_number, name, storage_path, file_size, parsed_at, reason, created_at')
    .eq('document_id' as never, documentId)
    .order('version_number' as never, { ascending: false })
    .returns<DocumentVersion[]>()
  return data ?? []
}

/** Mint a 60-minute signed download URL for any storage_path in the bucket. */
export async function signedDownloadUrl(
  storagePath: string,
): Promise<string | null> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)
  return data?.signedUrl ?? null
}
