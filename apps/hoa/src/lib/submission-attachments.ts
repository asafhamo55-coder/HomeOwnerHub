'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { ATTACHMENT_ALLOWED_TYPES, ATTACHMENT_MAX_BYTES } from '@/lib/attachment-rules'

// Attachments reuse the existing private `hoa-documents` bucket (see
// 0003_storage_policies.sql). Metadata lives in submission_attachments
// (0027). Files are stored under {org}/submissions/{thread}/{parent}/...
// Size and type limits live in attachment-rules.ts so the client picker
// can share them — this module is 'use server' and cannot export them.
const BUCKET = 'hoa-documents'

export type ThreadType = 'arc' | 'ticket' | 'concern'

export interface SubmissionAttachment {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  uploadedByRole: 'resident' | 'board' | 'admin'
  createdAt: string
  /** Time-limited download URL (1h). Null if the file can't be signed. */
  signedUrl: string | null
}

type ActionResult = { ok: true } | { ok: false; error: string }

const TargetSchema = z.object({
  threadType: z.enum(['arc', 'ticket', 'concern']),
  parentId: z.string().uuid(),
})

// The two routes (board + resident) that render each thread, so an upload
// or delete refreshes whichever side the other party is looking at.
function pathsFor(threadType: ThreadType, parentId: string): string[] {
  switch (threadType) {
    case 'arc':
      return [`/arc/${parentId}`, `/resident/arc/${parentId}`]
    case 'ticket':
      return [`/tickets/${parentId}`, `/resident/tickets/${parentId}`]
    case 'concern':
      return [`/violations/reports/${parentId}`, `/resident/violations/${parentId}`]
  }
}

function safeName(original: string): string {
  const dot = original.lastIndexOf('.')
  const ext = dot > 0 ? original.slice(dot).toLowerCase() : ''
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
}

export async function listSubmissionAttachments(
  threadType: ThreadType,
  parentId: string,
): Promise<SubmissionAttachment[]> {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('submission_attachments' as never)
    .select('id, file_name, content_type, size_bytes, uploaded_by_role, storage_path, created_at')
    .eq('thread_type' as never, threadType)
    .eq('parent_id' as never, parentId)
    .order('created_at' as never, { ascending: true })

  const rows = (data ?? []) as unknown as Array<{
    id: string
    file_name: string
    content_type: string | null
    size_bytes: number | null
    uploaded_by_role: 'resident' | 'board' | 'admin'
    storage_path: string
    created_at: string
  }>

  const out: SubmissionAttachment[] = []
  for (const r of rows) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(r.storage_path, 60 * 60)
    out.push({
      id: r.id,
      fileName: r.file_name,
      contentType: r.content_type,
      sizeBytes: r.size_bytes,
      uploadedByRole: r.uploaded_by_role,
      createdAt: r.created_at,
      signedUrl: signed?.signedUrl ?? null,
    })
  }
  return out
}

export async function uploadSubmissionAttachment(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = TargetSchema.safeParse({
    threadType: formData.get('threadType'),
    parentId: formData.get('parentId'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid attachment target.' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose a file to attach.' }
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'File must be under 10 MB.' }
  }
  if (file.type && !ATTACHMENT_ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: 'Allowed types: PDF, image, or Word/Excel document.',
    }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const role = await getCurrentUserRoleInOrg(org.id)
  if (!role) return { ok: false, error: 'You do not have access to this HOA.' }

  const storagePath = `${org.id}/submissions/${parsed.data.threadType}/${parsed.data.parentId}/${safeName(file.name)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    })
  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes('not found')) {
      return {
        ok: false,
        error:
          "The 'hoa-documents' storage bucket is missing. Create it (Private) in Supabase, then retry.",
      }
    }
    return { ok: false, error: uploadError.message }
  }

  const { error: insertError } = await supabase
    .from('submission_attachments' as never)
    .insert({
      organization_id: org.id,
      thread_type: parsed.data.threadType,
      parent_id: parsed.data.parentId,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: user.id,
      uploaded_by_role: role,
    } as never)

  if (insertError) {
    // Roll back the orphaned object so a failed insert doesn't leave a file.
    await supabase.storage.from(BUCKET).remove([storagePath])
    return { ok: false, error: insertError.message }
  }

  for (const p of pathsFor(parsed.data.threadType, parsed.data.parentId)) {
    revalidatePath(p)
  }
  return { ok: true }
}

export async function deleteSubmissionAttachment(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Invalid attachment.' }
  }
  const supabase = await getSupabaseServerClient()

  // Read first so we know the object path and where to revalidate. RLS
  // limits this to attachments the caller can see; the delete below is
  // further gated to board/admin (only sa_board_or_admin_all grants DELETE).
  const { data } = await supabase
    .from('submission_attachments' as never)
    .select('storage_path, thread_type, parent_id')
    .eq('id' as never, id)
    .maybeSingle()
  const row = data as unknown as {
    storage_path: string
    thread_type: ThreadType
    parent_id: string
  } | null
  if (!row) return { ok: false, error: 'Attachment not found.' }

  const { error, count } = await supabase
    .from('submission_attachments' as never)
    .delete({ count: 'exact' })
    .eq('id' as never, id)
  if (error) return { ok: false, error: error.message }
  if (!count) return { ok: false, error: 'You cannot remove this attachment.' }

  await supabase.storage.from(BUCKET).remove([row.storage_path])

  for (const p of pathsFor(row.thread_type, row.parent_id)) {
    revalidatePath(p)
  }
  return { ok: true }
}
